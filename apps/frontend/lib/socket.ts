'use client';

import { io, Socket } from 'socket.io-client';
import type { Role } from '@/store/authStore';

let socket: Socket | null = null;

interface ConnectParams {
  token: string | null;
  spaceId: string | null;
  role: Role | null;
}

// Previously sent { spaceId, role } directly — the gateway trusted
// whatever the client claimed. Now sends the real JWT and the gateway
// verifies it itself (see events.gateway.ts, 2026-09-10), deriving
// spaceId/role from the token instead of believing the client.
export function connectSocket({
  token,
  spaceId,
  role,
}: ConnectParams): Socket | null {
  // A socket connection requires tenant identity. PLATFORM_ADMIN has
  // no spaceId, and the gateway only allows SPACE_MANAGER/MEMBER roles
  // to join a space room — don't bother connecting otherwise.
  if (!token || !spaceId || !role) {
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000', {
    auth: { token },
    autoConnect: false,
  });

  socket.connect();
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
