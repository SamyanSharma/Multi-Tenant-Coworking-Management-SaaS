'use client';

import { io, Socket } from 'socket.io-client';
import { Role } from '@/store/authStore';

let socket: Socket | null = null;

interface SocketAuth {
  token: string | null;
  spaceId: string | null;
  role: Role | null;
}

export function connectSocket(
  token: string | null,
  spaceId: string | null,
  role: Role | null,
): Socket | null {
  if (!token || !spaceId || !role) {
    return null;
  }

  if (socket) {
    return socket;
  }

  const auth: SocketAuth = {
    token,
    spaceId,
    role,
  };

  socket = io(
    process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000',
    {
      auth,
      autoConnect: false,
    },
  );

  socket.connect();

  return socket;
}

export function getSocket(
  token: string | null,
  spaceId: string | null,
  role: Role | null,
): Socket | null {
  return connectSocket(token, spaceId, role);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}