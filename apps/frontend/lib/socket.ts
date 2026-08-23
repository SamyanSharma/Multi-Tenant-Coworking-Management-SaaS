'use client';

import { io, Socket } from 'socket.io-client';
import type { Role } from '@/store/authStore';

let socket: Socket | null = null;

interface ConnectParams {
  spaceId: string | null;
  role: Role | null;
}

// Connects (or reuses) a single shared Socket.io connection for the
// current dashboard session.
//
// IMPORTANT: the auth payload keys here (`spaceId`, `role`) must match
// events.gateway.ts's handleConnection exactly — it reads
// `socket.handshake.auth.spaceId` and `socket.handshake.auth.role` and
// rejects the connection (emits `connection_error`, disconnects) if
// either is missing or role isn't SPACE_MANAGER/MEMBER. There is no
// `userId` or `token` field in the real handshake contract — the
// gateway doesn't read either, so sending them is harmless but doesn't
// do anything.
//
// Call connectSocket() once when the dashboard mounts, disconnectSocket()
// on unmount. Don't call this per-page — one connection for the whole
// dashboard session.
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
