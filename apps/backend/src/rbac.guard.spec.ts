import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard', () => {
  function mockContext(headers: Record<string, string>): ExecutionContext {
    const request = { headers };
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
    const ctx = mockContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when x-user-role header is missing', () => {
    const guard = guardWithRequiredRoles([Role.PLATFORM_ADMIN]);
    const ctx = mockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws when x-user-role is not a recognized role', () => {
    const guard = guardWithRequiredRoles([Role.PLATFORM_ADMIN]);
    const ctx = mockContext({ 'x-user-role': 'SUPER_ADMIN' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws when the caller role is not in the required list', () => {
    const guard = guardWithRequiredRoles([Role.PLATFORM_ADMIN]);
    const ctx = mockContext({ 'x-user-role': Role.MEMBER });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows and attaches userRole when the caller role matches', () => {
    const guard = guardWithRequiredRoles([Role.SPACE_MANAGER, Role.MEMBER]);
    const request = { headers: { 'x-user-role': Role.MEMBER } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request['userRole']).toBe(Role.MEMBER);
  });
});
