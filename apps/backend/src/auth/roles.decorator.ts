import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

// Re-exported here so feature modules can `import { Role } from
// '../auth/roles.decorator'` and get both the decorator and the enum from
// one place. The enum itself is the one generated from schema.prisma —
// never redeclared — so it can't drift from the DB's Role enum.
export { Role };

export const ROLES_KEY = 'roles';

/**
 * Declares which roles may access a route. Read by RbacGuard via Reflector.
 * A route with no @Roles() at all is unrestricted (RbacGuard lets it
 * through) — @Roles() with zero arguments means "no role qualifies",
 * effectively locking the route out entirely, which is almost certainly
 * a mistake if it happens by accident.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
