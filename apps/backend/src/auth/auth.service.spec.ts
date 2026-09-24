import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

function uniqueConstraintError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    space: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: JwtService;

  const KNOWN_PASSWORD = 'correct-horse-battery-staple';
  let knownHash: string;

  beforeAll(async () => {
    knownHash = await bcrypt.hash(KNOWN_PASSWORD, 10);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      space: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    jwtService = new JwtService({ secret: 'test-secret' });
    service = new AuthService(prisma as any, jwtService);
  });

  it('rejects an email that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login('nobody@example.com', KNOWN_PASSWORD),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a user that has no password set (nullable column, pre-migration data)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      password: null,
      role: Role.MEMBER,
      spaceId: 'space-1',
    });

    await expect(
      service.login('a@example.com', KNOWN_PASSWORD),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an incorrect password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      password: knownHash,
      role: Role.MEMBER,
      spaceId: 'space-1',
    });

    await expect(
      service.login('a@example.com', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns a signed token + user summary for correct credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      name: 'Test User',
      password: knownHash,
      role: Role.MEMBER,
      spaceId: 'space-1',
    });

    const result = await service.login('a@example.com', KNOWN_PASSWORD);

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'a@example.com',
      name: 'Test User',
      role: Role.MEMBER,
      spaceId: 'space-1',
    });

    const decoded = jwtService.verify(result.accessToken) as {
      sub: string;
      role: string;
      spaceId: string;
    };
    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe(Role.MEMBER);
    expect(decoded.spaceId).toBe('space-1');
  });

  describe('signup — SPACE_MANAGER ("List my space")', () => {
    function mockTransaction(spaceId: string, userId: string) {
      const tx = {
        space: {
          create: jest.fn().mockResolvedValue({
            id: spaceId,
            name: 'Acme Coworking',
            slug: 'acme-coworking',
          }),
        },
        user: {
          create: jest.fn().mockResolvedValue({
            id: userId,
            email: 'manager@acme.com',
            name: 'Ada',
            role: Role.SPACE_MANAGER,
            spaceId,
          }),
        },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));
      return tx;
    }

    const baseInput = {
      name: 'Ada',
      email: 'manager@acme.com',
      password: 'a-real-password',
      role: 'SPACE_MANAGER' as const,
      spaceName: 'Acme Coworking',
    };

    it('rejects signup when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.signup(baseInput)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a Space + SPACE_MANAGER and returns a signed token on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const tx = mockTransaction('space-new', 'user-new');

      const result = await service.signup(baseInput);

      expect(tx.space.create).toHaveBeenCalledWith({
        data: { name: 'Acme Coworking', slug: 'acme-coworking' },
      });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Ada',
          email: 'manager@acme.com',
          role: Role.SPACE_MANAGER,
          spaceId: 'space-new',
        }),
      });

      expect(result.user).toEqual({
        id: 'user-new',
        email: 'manager@acme.com',
        name: 'Ada',
        role: Role.SPACE_MANAGER,
        spaceId: 'space-new',
      });

      const decoded = jwtService.verify(result.accessToken) as {
        sub: string;
        role: string;
        spaceId: string;
      };
      expect(decoded.sub).toBe('user-new');
      expect(decoded.role).toBe(Role.SPACE_MANAGER);
      expect(decoded.spaceId).toBe('space-new');
    });

    it('hashes the password before storing it (never stores plaintext)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const tx = mockTransaction('space-new', 'user-new');

      await service.signup(baseInput);

      const storedPassword = tx.user.create.mock.calls[0][0].data.password;
      expect(storedPassword).not.toBe('a-real-password');
      expect(
        await bcrypt.compare('a-real-password', storedPassword),
      ).toBe(true);
    });

    it('retries with a suffixed slug when the slug collides, then succeeds', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      let callCount = 0;
      prisma.$transaction.mockImplementation(async (cb: any) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: simulate the slug already existing.
          throw uniqueConstraintError(['slug']);
        }
        const tx = {
          space: {
            create: jest.fn().mockResolvedValue({
              id: 'space-2',
              name: 'Acme Coworking',
              slug: 'acme-coworking-x7f2q',
            }),
          },
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'user-2',
              email: 'manager@acme.com',
              name: 'Ada',
              role: Role.SPACE_MANAGER,
              spaceId: 'space-2',
            }),
          },
        };
        return cb(tx);
      });

      const result = await service.signup(baseInput);

      expect(callCount).toBe(2);
      expect(result.user.spaceId).toBe('space-2');
    });

    it('surfaces an email collision immediately, without retrying', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async () => {
        throw uniqueConstraintError(['email']);
      });

      await expect(service.signup(baseInput)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('gives up after MAX_SLUG_ATTEMPTS repeated slug collisions', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async () => {
        throw uniqueConstraintError(['slug']);
      });

      await expect(service.signup(baseInput)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    });
  });

  describe('signup — MEMBER ("Rent a space")', () => {
    const baseInput = {
      name: 'Bob',
      email: 'bob@example.com',
      password: 'a-real-password',
      role: 'MEMBER' as const,
      spaceSlug: 'acme-coworking',
    };

    it('rejects signup when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.signup(baseInput)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.space.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when no space exists with that slug', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.space.findFirst.mockResolvedValue(null);

      await expect(service.signup(baseInput)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a MEMBER signup that supplies neither spaceId nor spaceSlug', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.signup({
          name: 'Bob',
          email: 'bob@example.com',
          password: 'a-real-password',
          role: 'MEMBER' as const,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.space.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('joins the existing space as MEMBER and returns a signed token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.space.findFirst.mockResolvedValue({
        id: 'space-existing',
        name: 'Acme Coworking',
        slug: 'acme-coworking',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-bob',
        email: 'bob@example.com',
        name: 'Bob',
        role: Role.MEMBER,
        spaceId: 'space-existing',
      });

      const result = await service.signup(baseInput);

      expect(prisma.space.findFirst).toHaveBeenCalledWith({
        where: { deletedAt: null, slug: 'acme-coworking' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Bob',
          email: 'bob@example.com',
          role: Role.MEMBER,
          spaceId: 'space-existing',
        }),
      });

      expect(result.user).toEqual({
        id: 'user-bob',
        email: 'bob@example.com',
        name: 'Bob',
        role: Role.MEMBER,
        spaceId: 'space-existing',
      });

      const decoded = jwtService.verify(result.accessToken) as {
        sub: string;
        role: string;
        spaceId: string;
      };
      expect(decoded.role).toBe(Role.MEMBER);
      expect(decoded.spaceId).toBe('space-existing');
    });

    it('joins by spaceId when browsing GET /spaces/public instead of typing a code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.space.findFirst.mockResolvedValue({
        id: 'space-browsed',
        name: 'Acme Coworking',
        slug: 'acme-coworking',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-carol',
        email: 'carol@example.com',
        name: 'Carol',
        role: Role.MEMBER,
        spaceId: 'space-browsed',
      });

      const result = await service.signup({
        name: 'Carol',
        email: 'carol@example.com',
        password: 'a-real-password',
        role: 'MEMBER' as const,
        spaceId: 'space-browsed',
      });

      // spaceId wins over any stray spaceSlug, and a deleted space is
      // excluded the same way the slug path excludes it.
      expect(prisma.space.findFirst).toHaveBeenCalledWith({
        where: { deletedAt: null, id: 'space-browsed' },
      });
      expect(result.user.spaceId).toBe('space-browsed');
    });

    it('rejects joining a space that has since closed (deletedAt set), whether by id or slug', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.space.findFirst.mockResolvedValue(null); // the LIVE filter excludes it

      await expect(
        service.signup({
          name: 'Dee',
          email: 'dee@example.com',
          password: 'a-real-password',
          role: 'MEMBER' as const,
          spaceId: 'space-closed',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('surfaces a race-condition email collision as a Conflict, not a raw 500', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.space.findFirst.mockResolvedValue({
        id: 'space-existing',
        name: 'Acme Coworking',
        slug: 'acme-coworking',
      });
      prisma.user.create.mockRejectedValue(uniqueConstraintError(['email']));

      await expect(service.signup(baseInput)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
