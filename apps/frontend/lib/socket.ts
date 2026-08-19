import { io, Socket } from 'socket.io-client';
import type { Role } from '@/store/authStore';

let socket: Socket | null = null;

interface ConnectParams {
  spaceId: string | null;
  userRole: Role | null;
  userId: string | null;
}

// Connects (or reuses) a single shared Socket.io connection for the
// current dashboard session. Per the proposed Stage 5 contract
// (Stage5_Socket_Event_Contract.md), identity is sent via the `auth`
// handshake payload — the same three values REST sends as headers
// (x-space-id, x-user-role, x-user-id) — since Socket.io's handshake
// doesn't have a clean per-event header mechanism the way HTTP does.
//
// Call connectSocket() once when the dashboard mounts, disconnectSocket()
// on unmount. Don't call this per-page — one connection for the whole
// dashboard session, matching PROGRESS.md's Stage 5 guidance.
export function connectSocket({ spaceId, userRole, userId }: ConnectParams): Socket {
  if (socket?.connected) return socket;

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000', {
    auth: { spaceId, userRole, userId },
    autoConnect: false,
  });

  socket.connect();
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
