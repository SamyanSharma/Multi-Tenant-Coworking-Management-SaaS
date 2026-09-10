import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

// Previously read the unverified x-user-id header — any caller could
// claim to be any user. Now reads req.user.id, set by JwtAuthGuard
// from the verified JWT's `sub` claim.
export function getCallerUserId(req: Request): string {
  if (!req.user) {
    // Unreachable on any route that isn't @Public() — JwtAuthGuard
    // throws first. Guard against it anyway rather than returning
    // `undefined` disguised as a string.
    throw new UnauthorizedException('No authenticated user on request');
  }

  return req.user.id;
}
