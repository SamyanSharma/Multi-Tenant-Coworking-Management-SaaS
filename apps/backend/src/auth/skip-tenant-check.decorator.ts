import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_CHECK_KEY = 'skipTenantCheck';

/**
 * Marks a route or controller as exempt from the global TenantGuard.
 * Use for routes that logically have no tenant context yet — e.g. health
 * checks, or login/register before Stage 2 auth resolves a spaceId.
 */
export const SkipTenantCheck = () => SetMetadata(SKIP_TENANT_CHECK_KEY, true);
