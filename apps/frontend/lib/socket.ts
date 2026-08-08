import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Lazily creates a single shared socket connection, authenticated with
// the current session token. Call this once (e.g. in a dashboard-level
// useEffect) rather than per-component, so multiple pages don't open
// duplicate connections.
//
// NOTE: no event listeners wired yet — ARCHITECTURE.md's Real-Time
// Events table is still [TBD]. See Realtime_Events_Draft.md.
//
// NOT YET UPDATED to x-space-id/x-user-role — still uses token-based
// auth. Confirm with Arpit whether the socket handshake uses the same
// header pattern as REST before Stage 5 work starts.
export function getSocket(token: string | null): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001', {
      auth: { token },
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
