import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY, Role } from './roles.decorator';

declare module 'express' {
  interface Request {
    userRole?: Role;
  }
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() on this route at all → no restriction, let it through.
    // (Distinct from an empty array, which would mean "nobody" — see note below.)
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
