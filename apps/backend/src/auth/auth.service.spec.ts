import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
    user: { findUnique: jest.Mock };
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
      user: { findUnique: jest.fn() },
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

  describe('signup', () => {
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

    it('rejects signup when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.signup(
          'Ada',
          'manager@acme.com',
          'a-real-password',
          'Acme Coworking',
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a Space + SPACE_MANAGER and returns a signed token on success', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const tx = mockTransaction('space-new', 'user-new');

      const result = await service.signup(
        'Ada',
        'manager@acme.com',
        'a-real-password',
        'Acme Coworking',
      );

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

      await service.signup(
        'Ada',
        'manager@acme.com',
        'a-real-password',
        'Acme Coworking',
      );

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

      const result = await service.signup(
        'Ada',
        'manager@acme.com',
        'a-real-password',
        'Acme Coworking',
      );

      expect(callCount).toBe(2);
      expect(result.user.spaceId).toBe('space-2');
    });

    it('surfaces an email collision immediately, without retrying', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async () => {
        throw uniqueConstraintError(['email']);
      });

      await expect(
        service.signup(
          'Ada',
          'manager@acme.com',
          'a-real-password',
          'Acme Coworking',
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('gives up after MAX_SLUG_ATTEMPTS repeated slug collisions', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async () => {
        throw uniqueConstraintError(['slug']);
      });

      await expect(
        service.signup(
          'Ada',
          'manager@acme.com',
          'a-real-password',
          'Acme Coworking',
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    });
  });
});
