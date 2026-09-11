import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// Real JWT auth (2026-09-10 backend) replaced the old x-user-role /
// x-user-id / x-space-id trust headers entirely. The backend no
// longer reads any of them for identity — a valid Authorization
// header is now required on every route except @Public() ones
// (login, health check, Stripe webhook).
//
// x-space-id is the one exception that's still sent, and only for
// PLATFORM_ADMIN: they aren't scoped to a single space, so some
// routes still need them to say which space they're acting on. For
// SPACE_MANAGER/MEMBER, spaceId comes from inside their own verified
// token — sending it here would be ignored by TenantGuard anyway.
export function getAuthHeaders(): Record<string, string> {
  const { token, role, spaceId } = useAuthStore.getState();

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (role === 'PLATFORM_ADMIN' && spaceId) {
    headers['x-space-id'] = spaceId;
  }

  return headers;
}

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: 'PLATFORM_ADMIN' | 'SPACE_MANAGER' | 'MEMBER';
    spaceId: string | null;
  };
}

// Thin wrapper around POST /auth/login. Throws with the backend's own
// message (e.g. "Invalid email or password") on a non-2xx response so
// callers can show it directly rather than a generic failure.
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message ?? `Login failed (${res.status})`);
  }

  return data as LoginResult;
}
