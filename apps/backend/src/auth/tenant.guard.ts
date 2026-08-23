import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_TENANT_CHECK_KEY } from './skip-tenant-check.decorator';

// Loose cuid-shape check — catches typos/garbage/missing headers, not a
// full cuid parser. Good enough for a placeholder that gets replaced by
// real auth-derived spaceId lookups in a later stage.
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

/**
 * Registered globally (via APP_GUARD in AppModule) so every route requires
 * a spaceId by default. Currently reads it from the x-space-id header as a
 * placeholder until real auth (JWT -> user -> spaceId lookup) exists —
 * only this method's body changes when that lands, not the guard's shape.
 *
 * Routes that genuinely don't need tenant context (health checks, future
 * login/register endpoints) should use @SkipTenantCheck().
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const spaceId = request.headers['x-space-id'];

    if (!spaceId || Array.isArray(spaceId)) {
      throw new BadRequestException('Missing or invalid x-space-id header');
    }

    if (!CUID_REGEX.test(spaceId)) {
      throw new BadRequestException('x-space-id is not a valid id');
    }

    request.spaceId = spaceId;
    return true;
  }
}
