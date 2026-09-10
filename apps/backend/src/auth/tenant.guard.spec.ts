import { ExecutionContext, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  // Builds a fake ExecutionContext with req.user already set, the way
  // JwtAuthGuard (which runs before TenantGuard in the real app) would
  // have set it from a verified JWT.
  function mockContext(
    user: { id: string; role: Role; spaceId: string | null } | undefined,
    headers: Record<string, string> = {},
  ): {
    ctx: ExecutionContext;
    request: {
      headers: Record<string, string>;
      user?: typeof user;
      spaceId?: string;
    };
  } {
    const request: {
      headers: Record<string, string>;
      user?: typeof user;
      spaceId?: string;
    } = { headers, user };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('throws when there is no req.user at all (JwtAuthGuard should have run first)', () => {
    const { ctx } = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('MEMBER/SPACE_MANAGER: scopes to their own JWT spaceId, ignoring any x-space-id header', () => {
    const { ctx, request } = mockContext(
      { id: 'user-1', role: Role.MEMBER, spaceId: 'cku8x2vwn0000abcd1234efgh' },
      { 'x-space-id': 'ckSOMEOTHERSPACEaaaaaaaaaa' }, // attempted spoof
    );

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.spaceId).toBe('cku8x2vwn0000abcd1234efgh');
  });

  it('MEMBER/SPACE_MANAGER: throws if the JWT has no spaceId', () => {
    const { ctx } = mockContext({ id: 'user-1', role: Role.MEMBER, spaceId: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('PLATFORM_ADMIN: passes through with no spaceId set when no x-space-id header is given', () => {
    const { ctx, request } = mockContext({
      id: 'admin-1',
      role: Role.PLATFORM_ADMIN,
      spaceId: null,
    });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.spaceId).toBeUndefined();
  });

  it('PLATFORM_ADMIN: honors a valid x-space-id header', () => {
    const validId = 'cku8x2vwn0000abcd1234efgh';
    const { ctx, request } = mockContext(
      { id: 'admin-1', role: Role.PLATFORM_ADMIN, spaceId: null },
      { 'x-space-id': validId },
    );

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.spaceId).toBe(validId);
  });

  it('PLATFORM_ADMIN: throws on a malformed x-space-id header', () => {
    const { ctx } = mockContext(
      { id: 'admin-1', role: Role.PLATFORM_ADMIN, spaceId: null },
      { 'x-space-id': 'not-a-real-id' },
    );

    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('bypasses the check when @SkipTenantCheck() metadata is present', () => {
    const skipReflector = {
      getAllAndOverride: () => true,
    } as unknown as Reflector;
    const skipGuard = new TenantGuard(skipReflector);
    const { ctx } = mockContext(undefined); // no user at all
    expect(skipGuard.canActivate(ctx)).toBe(true);
  });
});
