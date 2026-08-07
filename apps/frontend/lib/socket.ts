import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Lazily creates a single shared socket connection, authenticated with
// the current session token. Call this once (e.g. in the dashboard
// layout's useEffect) rather than per-component, so multiple pages
// don't open duplicate connections.
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
