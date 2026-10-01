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

      throw new ForbiddenException('No authenticated user on request');
    }

    if (user.role === Role.PLATFORM_ADMIN) {
      const spaceIdHeader = request.headers['x-space-id'];

      if (!spaceIdHeader) {
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

  
    if (!user.spaceId) {
      throw new ForbiddenException(
        'User has no associated space',
      );
    }

    request.spaceId = user.spaceId;
    return true;
  }
}
