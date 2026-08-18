import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * NOT registered globally — apply per-route/controller with @UseGuards
 * alongside @Roles(...). Unlike TenantGuard (every route needs a tenant),
 * not every route needs a role restriction, so this stays opt-in.
 *
 * Reads role from the x-user-role header as a placeholder until real auth
 * exists (same caveat as TenantGuard's spaceId header).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() declared at all -> no restriction from this guard.
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const roleHeader = request.headers['x-user-role'];

    if (!roleHeader || Array.isArray(roleHeader)) {
      throw new ForbiddenException('Missing or invalid x-user-role header');
    }

    if (!Object.values(Role).includes(roleHeader as Role)) {
      throw new ForbiddenException(`Unknown role: ${roleHeader}`);
    }

    const userRole = roleHeader as Role;
    request.userRole = userRole;

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Role ${userRole} is not permitted to access this resource`,
      );
    }

    return true;
  }
}
