import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'PLATFORM_ADMIN' | 'SPACE_MANAGER' | 'MEMBER';

interface AuthState {
  token: string | null;
  role: Role | null;
  spaceId: string | null;

  setAuth: (auth: {
    token: string;
    role: Role;
    spaceId: string | null;
  }) => void;

  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      spaceId: null,

      setAuth: ({ token, role, spaceId }) =>
        set({
          token,
          role,
          spaceId,
        }),

      logout: () =>
        set({
          token: null,
          role: null,
          spaceId: null,
        }),
    }),
    {
      name: 'coworking-auth',
    },
  ),
);