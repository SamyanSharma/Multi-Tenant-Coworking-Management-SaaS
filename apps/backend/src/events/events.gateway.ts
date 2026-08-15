import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

// Same loose cuid-shape check used by TenantGuard for HTTP requests — kept
// as a standalone constant here rather than importing from tenant.guard.ts,
// since a WebSocket gateway and an HTTP guard are different NestJS
// lifecycles and shouldn't share a class-level dependency for one regex.
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

function spaceRoom(spaceId: string): string {
  return `space:${spaceId}`;
}

/**
 * Real-time layer for spaceId-scoped events (Stage 5).
 *
 * Every connecting client must identify its spaceId at connect time via
 * `socket.handshake.auth.spaceId` — this is the WebSocket equivalent of
 * TenantGuard's `x-space-id` header placeholder: trusted from the client
 * for now, to be replaced by a verified-token-derived spaceId once real
 * auth (JWT) exists. The socket is immediately joined to a room scoped to
 * that spaceId (`space:<id>`), and every subsequent broadcast into that
 * room is guaranteed to reach ONLY clients who identified as that tenant
 * — this is what actually enforces the "Space_Manager only sees their own
 * space's events" requirement, not anything on the client side.
 */
@WebSocketGateway({
  cors: {
    // Wide open for local dev — tighten to the deployed frontend's real
    // origin before Stage 8 (deployment). See PROGRESS.md's deployment
    // open questions.
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    const spaceId = client.handshake.auth?.spaceId as string | undefined;

    if (!spaceId || !CUID_REGEX.test(spaceId)) {
      this.logger.warn(
        `Rejecting socket ${client.id}: missing or invalid spaceId in handshake.auth`,
      );
      // Emit before disconnecting so the frontend can show a real error
      // instead of a silent connection drop.
      client.emit('connection_error', {
        message: 'Missing or invalid spaceId — connection rejected',
      });
      client.disconnect(true);
      return;
    }

    client.join(spaceRoom(spaceId));
    this.logger.log(`Socket ${client.id} joined ${spaceRoom(spaceId)}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  /**
   * Broadcasts a booking_created event to ONLY the room matching the
   * booking's space — never a global broadcast. Called from
   * BookingsService after a successful DB write, not in response to an
   * incoming socket message (bookings are created via the REST API).
   */
  emitBookingCreated(spaceId: string, payload: unknown): void {
    this.server.to(spaceRoom(spaceId)).emit('booking_created', payload);
  }
}
