// apps/backend/src/auth/tenant.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SKIP_TENANT_CHECK_KEY } from './skip-tenant-check.decorator';

declare module 'express' {
  interface Request {
    spaceId?: string;
  }
}

const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

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
