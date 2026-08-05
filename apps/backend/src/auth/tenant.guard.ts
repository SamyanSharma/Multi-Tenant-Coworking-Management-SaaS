import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';

// Extend Express's Request type so `req.spaceId` is typed everywhere downstream
declare module 'express' {
  interface Request {
    spaceId?: string;
  }
}

const CUID_REGEX = /^c[a-z0-9]{20,}$/i; // loose check — good enough to catch typos/garbage, not a full cuid parser

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const spaceId = request.headers['x-space-id'];

    if (!spaceId || Array.isArray(spaceId)) {
      throw new BadRequestException(
        'Missing or invalid x-space-id header',
      );
    }

    if (!CUID_REGEX.test(spaceId)) {
      throw new BadRequestException('x-space-id is not a valid id');
    }

    request.spaceId = spaceId;
    return true;
  }
}
