import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RbacGuard } from './rbac.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

describe('RbacGuard', () => {
  function mockContext(
    user: { id: string; role: Role } | undefined,
  ): ExecutionContext {
    const request = { user };
    function fakeHandler() {}
    class FakeController {}
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => fakeHandler,
      getClass: () => FakeController,
    } as unknown as ExecutionContext;
  }

  // Key-aware reflector: the guard now reads two metadata keys
  // (IS_PUBLIC_KEY and ROLES_KEY), so a single canned return value
  // would answer both the same way.
  function guardWith(opts: { roles?: Role[]; isPublic?: boolean }) {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === IS_PUBLIC_KEY
          ? opts.isPublic
          : key === ROLES_KEY
            ? opts.roles
            : undefined,
    } as unknown as Reflector;
    return new RbacGuard(reflector);
  }

  it('DENIES a route that declares neither @Public() nor @Roles() (deny-by-default)', () => {
    const guard = guardWith({});
    const ctx = mockContext({ id: 'user-1', role: Role.PLATFORM_ADMIN });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies a route with an empty @Roles() list', () => {
    const guard = guardWith({ roles: [] });
    const ctx = mockContext({ id: 'user-1', role: Role.PLATFORM_ADMIN });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a @Public() route through with no user at all', () => {
    const guard = guardWith({ isPublic: true });
    const ctx = mockContext(undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Public() wins even if @Roles() is also present', () => {
    const guard = guardWith({ isPublic: true, roles: [Role.PLATFORM_ADMIN] });
    const ctx = mockContext(undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when there is no req.user at all (JwtAuthGuard should have run first)', () => {
    const guard = guardWith({ roles: [Role.PLATFORM_ADMIN] });
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws when the caller role is not in the required list', () => {
    const guard = guardWith({ roles: [Role.PLATFORM_ADMIN] });
    const ctx = mockContext({ id: 'user-1', role: Role.MEMBER });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when the caller role matches', () => {
    const guard = guardWith({ roles: [Role.SPACE_MANAGER, Role.MEMBER] });
    const ctx = mockContext({ id: 'user-1', role: Role.MEMBER });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
