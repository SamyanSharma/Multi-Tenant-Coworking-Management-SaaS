import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

// Previously read the unverified x-user-id header — any caller could
// claim to be any user. Now reads req.user.id, set by JwtAuthGuard
// from the verified JWT's `sub` claim.
export function getCallerUserId(req: Request): string {
  if (!req.user) {
   
    throw new UnauthorizedException('No authenticated user on request');
  }

  return req.user.id;
}
