import { useAuthStore } from '@/store/authStore';

// Arpit's NestJS guard reads `x-space-id` and `x-user-role` headers to
// scope/authorize each request — not a Bearer token. Centralizing this
// here means if the backend's auth contract changes again, it's a
// one-file fix instead of hunting through every fetch call.
export function getAuthHeaders(): Record<string, string> {
  const { spaceId, role } = useAuthStore.getState();

  const headers: Record<string, string> = {};
  if (spaceId) headers['x-space-id'] = spaceId;
  if (role) headers['x-user-role'] = role;

  return headers;
}
