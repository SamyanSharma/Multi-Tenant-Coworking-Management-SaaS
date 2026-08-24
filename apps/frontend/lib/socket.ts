'use client';

import { io, Socket } from 'socket.io-client';
import type { Role } from '@/store/authStore';

let socket: Socket | null = null;

interface ConnectParams {
  spaceId: string | null;
  role: Role | null;
}

//.
export function connectSocket({ spaceId, role }: ConnectParams): Socket | null {
  // PLATFORM_ADMIN has no spaceId, and the gateway only allows
  // SPACE_MANAGER/MEMBER anyway — don't bother connecting.
  if (!spaceId || !role) {
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000', {
    auth: { spaceId, role },
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
