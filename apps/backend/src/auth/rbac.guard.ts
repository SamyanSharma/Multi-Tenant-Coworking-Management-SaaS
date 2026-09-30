import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

// Registered as a GLOBAL guard in app.module.ts (after JwtAuthGuard and
// TenantGuard), and DENY-BY-DEFAULT: every route must either be @Public()
// or declare @Roles(...). A route that declares neither is refused.
//
// Why deny-by-default: the previous version was attached route-by-route
// with @UseGuards(RbacGuard) and allowed the request when no @Roles() was
// present, so a new endpoint that forgot either decorator was silently open
// to every authenticated role (GET /spaces/me and GET /spaces/:id were
// exactly that). Forgetting a decorator now fails closed (403) and is caught
// the first time the route is called, instead of shipping as a hole.
//
// Reads the role off req.user (verified from the JWT by JwtAuthGuard),
// never off a request header.
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    // @Public() routes (login, signup, health, Stripe webhook, public
    // space directory) have no user and no role to check.
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      targets,
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.warn(
        `Denied ${context.getClass().name}.${context.getHandler().name}: ` +
          'route has neither @Public() nor @Roles() (deny-by-default)',
      );
      throw new ForbiddenException('Access denied');
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
