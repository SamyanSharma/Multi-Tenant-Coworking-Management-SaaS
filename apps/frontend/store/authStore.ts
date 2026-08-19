import { create } from 'zustand';

export type Role = 'PLATFORM_ADMIN' | 'SPACE_MANAGER' | 'MEMBER';

interface AuthState {
  token: string | null;
  role: Role | null;
  spaceId: string | null; // null for PLATFORM_ADMIN, set for the other two roles
  userId: string | null; // real User.id — required by POST /bookings' x-user-id header
  setAuth: (auth: { token: string; role: Role; spaceId: string | null; userId?: string | null }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  spaceId: null,
  userId: null,
  setAuth: ({ token, role, spaceId, userId = null }) => set({ token, role, spaceId, userId }),
  logout: () => set({ token: null, role: null, spaceId: null, userId: null }),
}));
