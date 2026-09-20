import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The tenant (space) a request acts on, or a clear 400.
 *
 * TenantGuard always sets req.spaceId for a Space Manager / Member (from their
 * verified token). A Platform Admin is not scoped to one space, so for them it
 * is only set when they send `x-space-id`. Controllers used to write
 * `req.spaceId!`, which turned "admin forgot the header" into
 * `findUnique({ where: { id: undefined } })` — a Prisma validation error that
 * surfaced as an HTTP 500 (and, on filters, would silently drop the tenant
 * condition altogether). Failing loudly with a 400 here is the safe behaviour.
 */
export function requireSpaceId(req: Request): string {
  if (!req.spaceId) {
    throw new BadRequestException(
      'This request needs a space. Platform admins must send the x-space-id header.',
    );
  }
  return req.spaceId;
}
