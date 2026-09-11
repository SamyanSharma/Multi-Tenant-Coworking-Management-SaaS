import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'PLATFORM_ADMIN' | 'SPACE_MANAGER' | 'MEMBER';

interface AuthState {
  token: string | null; // real JWT from POST /auth/login (2026-09-10)
  role: Role | null;
  spaceId: string | null; // null for PLATFORM_ADMIN, set for the other two roles
  userId: string | null; // real User.id, from the token's `sub` claim

  setAuth: (auth: {
    token: string;
    role: Role;
    spaceId: string | null;
    userId?: string | null;
  }) => void;

  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      spaceId: null,
      userId: null,

      setAuth: ({ token, role, spaceId, userId = null }) =>
        set({
          token,
          role,
          spaceId,
          userId,
        }),

      logout: () =>
        set({
          token: null,
          role: null,
          spaceId: null,
          userId: null,
        }),
    }),
    {
      name: 'coworking-auth',
      // Persisted to localStorage, same as this store did before real
      // auth existed. Simplest option for a capstone demo, but note
      // the tradeoff: unlike an httpOnly cookie, a token in
      // localStorage is readable by any JS that runs on this origin
      // (XSS risk). Fine here; flag if this app ever goes past a demo.
    },
  ),
);
