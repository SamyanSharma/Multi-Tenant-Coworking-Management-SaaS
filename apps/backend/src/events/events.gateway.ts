import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

// Same loose cuid-shape check used by TenantGuard for HTTP requests.
// This is still placeholder authentication until real JWT-based
// authentication is implemented.
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

const ALLOWED_ROLES = [
  'SPACE_MANAGER',
  'MEMBER',
] as const;

function spaceRoom(spaceId: string): string {
  return `space:${spaceId}`;
}

/**
 * Real-time layer for spaceId-scoped events.
 *
 * Every connecting client must provide:
 *
 *   socket.handshake.auth.spaceId
 *   socket.handshake.auth.role
 *
 * The spaceId identifies the tenant and the role provides the
 * placeholder RBAC check used by the current application.
 *
 * Until JWT authentication exists, these values are still supplied
 * by the client and therefore are NOT cryptographically trusted.
 *
 * The important security boundary is that every broadcast is sent
 * only to the room belonging to the relevant space.
 */
@WebSocketGateway({
  cors: {
    // Wide open for local development.
    // Tighten this to the deployed frontend origin before deployment.
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    const spaceId =
      client.handshake.auth?.spaceId as string | undefined;

    const role =
      client.handshake.auth?.role as string | undefined;

    /*
     * Validate both tenant identity and role.
     *
     * A socket is rejected unless:
     *   1. spaceId exists,
     *   2. spaceId has the expected CUID shape,
     *   3. role exists, and
     *   4. role is one of the roles allowed to receive
     *      space-scoped realtime events.
     */
    if (
      !spaceId ||
      !CUID_REGEX.test(spaceId) ||
      !role ||
      !ALLOWED_ROLES.includes(
        role as (typeof ALLOWED_ROLES)[number],
      )
    ) {
      this.logger.warn(
        `Rejecting socket ${client.id}: missing or invalid spaceId/role in handshake.auth`,
      );

      client.emit('connection_error', {
        message:
          'Missing or invalid spaceId or role — connection rejected',
      });

      client.disconnect(true);
      return;
    }

    /*
     * Join ONLY the room for the validated tenant.
     *
     * Booking events are later emitted using:
     *
     *   server.to(space:<spaceId>).emit(...)
     *
     * Therefore clients from other spaces cannot receive this
     * space's booking_created events.
     */
    client.join(spaceRoom(spaceId));

    this.logger.log(
      `Socket ${client.id} joined ${spaceRoom(spaceId)} as ${role}`,
    );
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(
      `Socket ${client.id} disconnected`,
    );
  }

  /**
   * Broadcasts a booking_created event to ONLY the room matching
   * the booking's space.
   *
   * Called from BookingsService after the successful database write.
   */
  emitBookingCreated(
    spaceId: string,
    payload: unknown,
  ): void {
    this.server
      .to(spaceRoom(spaceId))
      .emit('booking_created', payload);
  }
}