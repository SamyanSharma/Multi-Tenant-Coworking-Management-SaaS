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

// Runs AFTER JwtAuthGuard, same as TenantGuard — reads the role off
// req.user (verified from the JWT) instead of the old x-user-role
// header, which any caller could previously set to anything.
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
    const userRole = request.user?.role;

    if (!userRole) {
      // Unreachable in practice — JwtAuthGuard always runs first and
      // throws before this guard if there's no valid token.
      throw new ForbiddenException('No authenticated user on request');
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Role ${userRole} is not permitted to access this resource`,
      );
    }

    return true;
  }
}
