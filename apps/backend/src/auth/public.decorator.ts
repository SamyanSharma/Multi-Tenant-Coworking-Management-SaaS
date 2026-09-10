import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as not requiring a JWT at all — e.g. the login route
// itself, health checks, and the Stripe webhook (which authenticates
// via its own signature scheme, not a user JWT).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
