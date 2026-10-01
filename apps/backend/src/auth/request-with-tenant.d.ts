import { Role } from '@prisma/client';

// Augments Express's Request type so req.spaceId
declare module 'express' {
  interface Request {
    spaceId?: string;
    // Deprecated: set only for backward-compat by the old header-trust
    // path. Guards now read role off req.user instead — see AUTH.md.
    userRole?: Role;
    // Verified JWT payload, attached by JwtAuthGuard. spaceId is null
    // for PLATFORM_ADMIN (not scoped to any single space).
    user?: {
      id: string;
      role: Role;
      spaceId: string | null;
    };
  }
}
