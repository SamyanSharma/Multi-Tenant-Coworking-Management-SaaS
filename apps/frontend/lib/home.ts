import type { Role } from '@/store/authStore';

// Where each role lands right after signing in. A Platform Admin has no
// space of their own, so the space list is useless to them; the platform
// overview is their real home.
export function homeFor(role: Role | null | undefined): string {
  return role === 'PLATFORM_ADMIN' ? '/dashboard/admin' : '/dashboard/spaces';
}
