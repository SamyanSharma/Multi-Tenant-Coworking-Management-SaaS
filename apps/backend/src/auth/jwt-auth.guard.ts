import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { JwtPayload } from './auth.service';

// Registered as a global guard in app.module.ts, running BEFORE
// TenantGuard/RbacGuard so req.user is populated before either of
// them runs. This is what replaces the old x-user-role/x-user-id
// header-trust model — those headers are no longer read anywhere
// except x-space-id, which TenantGuard still allows PLATFORM_ADMIN to
// set explicitly (see TenantGuard's comments).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = {
      id: payload.sub,
      role: payload.role as Role,
      spaceId: payload.spaceId,
    };

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return token;
  }
}
