import type { Request } from 'express';

// TODO(Stage 2 auth): userId should come from the authenticated caller
// (decoded JWT -> User lookup), not a header. Using a placeholder
// x-user-id header for now, same pattern as TenantGuard/RbacGuard's
// placeholder headers, so caller-scoped flows (booking creation, billing
// checkout ownership) are testable before real auth exists. Replace the
// body of this function, not its call sites, once auth lands — every
// controller that needs "who is calling" should keep calling this.
export function getCallerUserId(req: Request): string {
  return req.headers['x-user-id'] as string;
}
