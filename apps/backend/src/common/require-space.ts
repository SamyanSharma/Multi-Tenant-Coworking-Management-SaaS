import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

export function requireSpaceId(req: Request): string {
  if (!req.spaceId) {
    throw new BadRequestException(
      'This request needs a space. Platform admins must send the x-space-id header.',
    );
  }
  return req.spaceId;
}
