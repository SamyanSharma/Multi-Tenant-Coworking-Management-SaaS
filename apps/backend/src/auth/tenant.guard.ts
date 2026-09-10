import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { SKIP_TENANT_CHECK_KEY } from './skip-tenant-check.decorator';

const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

// Runs AFTER JwtAuthGuard (see app.module.ts's provider order), so
// req.user is always set here unless the route is @Public().
//
// Tenant scoping now comes from the verified JWT, not a client-
// supplied header — this is the actual security fix over the old
// model, where any caller could set x-space-id to any value and
// read/write another tenant's data.
//
// SPACE_MANAGER / MEMBER: always scoped to their own JWT spaceId.
// x-space-id is ignored entirely for them — they cannot override it.
// PLATFORM_ADMIN: not tied to one space, so x-space-id is still
// honored, but only because the caller's role was already verified
// by JwtAuthGuard — not because the header itself is trusted.
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
    const user = request.user;

    if (!user) {
      // Should be unreachable — JwtAuthGuard runs first and throws
      // before this guard if there's no valid token. Guard against it
      // anyway rather than silently proceeding with no tenant scope.
      throw new ForbiddenException('No authenticated user on request');
    }

    if (user.role === Role.PLATFORM_ADMIN) {
      const spaceIdHeader = request.headers['x-space-id'];

      if (!spaceIdHeader) {
        // Not every admin route needs a target space (e.g. listing
        // all spaces) — leave req.spaceId unset rather than forcing
        // every admin request to supply one.
        return true;
      }

      if (Array.isArray(spaceIdHeader)) {
        throw new BadRequestException('Invalid x-space-id header');
      }

      if (!CUID_REGEX.test(spaceIdHeader)) {
        throw new BadRequestException('x-space-id is not a valid id');
      }

      request.spaceId = spaceIdHeader;
      return true;
    }

    // SPACE_MANAGER / MEMBER: scoped strictly to their own space,
    // regardless of anything the client sends.
    if (!user.spaceId) {
      throw new ForbiddenException(
        'User has no associated space',
      );
    }

    request.spaceId = user.spaceId;
    return true;
  }
}
