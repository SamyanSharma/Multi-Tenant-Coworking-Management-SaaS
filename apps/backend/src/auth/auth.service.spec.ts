import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwtService: JwtService;

  const KNOWN_PASSWORD = 'correct-horse-battery-staple';
  let knownHash: string;

  beforeAll(async () => {
    knownHash = await bcrypt.hash(KNOWN_PASSWORD, 10);
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
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
});
