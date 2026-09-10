import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard', () => {
  function mockContext(
    user: { id: string; role: Role } | undefined,
  ): ExecutionContext {
    const request = { user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function guardWithRequiredRoles(roles: Role[] | undefined) {
    const reflector = {
      getAllAndOverride: () => roles,
    } as unknown as Reflector;
    return new RbacGuard(reflector);
  }

  it('allows the request through when the route has no @Roles() at all', () => {
    const guard = guardWithRequiredRoles(undefined);
    const ctx = mockContext(undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when there is no req.user at all (JwtAuthGuard should have run first)', () => {
    const guard = guardWithRequiredRoles([Role.PLATFORM_ADMIN]);
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws when the caller role is not in the required list', () => {
    const guard = guardWithRequiredRoles([Role.PLATFORM_ADMIN]);
    const ctx = mockContext({ id: 'user-1', role: Role.MEMBER });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when the caller role matches', () => {
    const guard = guardWithRequiredRoles([Role.SPACE_MANAGER, Role.MEMBER]);
    const ctx = mockContext({ id: 'user-1', role: Role.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
