import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let jwtService: JwtService;

  function mockContext(
    headers: Record<string, string>,
    isPublic = false,
  ): { ctx: ExecutionContext; request: { headers: Record<string, string>; user?: unknown } } {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers,
    };
    const reflector = {
      getAllAndOverride: () => isPublic,
    } as unknown as Reflector;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  function guard(isPublicReflector = false) {
    const reflector = {
      getAllAndOverride: () => isPublicReflector,
    } as unknown as Reflector;
    return new JwtAuthGuard(reflector, jwtService);
  }

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
  });

  it('allows @Public() routes through with no token at all', () => {
    const { ctx } = mockContext({}, true);
    expect(guard(true).canActivate(ctx)).toBe(true);
  });

  it('throws when there is no Authorization header', () => {
    const { ctx } = mockContext({});
    expect(() => guard().canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws when the Authorization header is not a Bearer token', () => {
    const { ctx } = mockContext({ authorization: 'Basic abc123' });
    expect(() => guard().canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws on a token signed with the wrong secret', () => {
    const forged = new JwtService({ secret: 'wrong-secret' });
    const token = forged.sign({
      sub: 'user-1',
      role: Role.MEMBER,
      spaceId: 'space-1',
    });
    const { ctx } = mockContext({ authorization: `Bearer ${token}` });
    expect(() => guard().canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('attaches req.user from a valid token', () => {
    const token = jwtService.sign({
      sub: 'user-1',
      role: Role.SPACE_MANAGER,
      spaceId: 'space-1',
    });
    const { ctx, request } = mockContext({
      authorization: `Bearer ${token}`,
    });

    expect(guard().canActivate(ctx)).toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      role: Role.SPACE_MANAGER,
      spaceId: 'space-1',
    });
  });
});
