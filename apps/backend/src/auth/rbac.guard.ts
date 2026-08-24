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

// reading role from the header instead of the frontend through authentication
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // no roles needed
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
