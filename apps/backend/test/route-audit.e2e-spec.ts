import { ModulesContainer, Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { bootstrapE2e, E2eContext } from './helpers/e2e-app';
import { IS_PUBLIC_KEY } from '../src/auth/public.decorator';
import { ROLES_KEY } from '../src/auth/roles.decorator';

// Structural safety net for deny-by-default RBAC: walks EVERY HTTP route in
// the app and fails if one declares neither @Public() nor @Roles(). Without
// this, a forgotten decorator would only show up as a 403 the first time
// someone happens to call that route.
describe('Route audit (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await bootstrapE2e();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('every route is either @Public() or declares @Roles()', () => {
    const modules = ctx.app.get(ModulesContainer, { strict: false });
    const reflector = new Reflector();
    const offenders: string[] = [];
    let routeCount = 0;

    for (const moduleRef of modules.values()) {
      for (const wrapper of moduleRef.controllers.values()) {
        const instance = wrapper.instance as object | undefined;
        if (!instance) continue;
        const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;

        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (typeof handler !== 'function') continue;
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue; // not a route

          routeCount++;
          const targets = [handler, proto.constructor];
          const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
          const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);

          if (!isPublic && (!roles || roles.length === 0)) {
            offenders.push(`${proto.constructor.name}.${name}`);
          }
        }
      }
    }

    expect(routeCount).toBeGreaterThan(20); // proves the scan really found the routes
    expect(offenders).toEqual([]);
  });
});
