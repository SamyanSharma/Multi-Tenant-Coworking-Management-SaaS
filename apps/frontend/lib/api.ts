import { useAuthStore } from '@/store/authStore';

// Arpit's NestJS guards read three placeholder headers (real JWT auth
// not built yet — see PROGRESS.md Open Questions):
//   x-space-id  — TenantGuard, checked globally on every request
//   x-user-role — RbacGuard, checked per-route via @Roles()
//   x-user-id   — BookingsController only, identifies who's creating a
//                 booking. This is a REAL foreign key to User.id in
//                 Postgres — there's no /users endpoint yet, so this
//                 currently has to be a real id you already have (e.g.
//                 from Prisma Studio), not something the frontend can
//                 generate on its own.
export function getAuthHeaders(): Record<string, string> {
  const { spaceId, role, userId } = useAuthStore.getState();

  const headers: Record<string, string> = {};
  if (spaceId) headers['x-space-id'] = spaceId;
  if (role) headers['x-user-role'] = role;
  if (userId) headers['x-user-id'] = userId;

  return headers;
}
