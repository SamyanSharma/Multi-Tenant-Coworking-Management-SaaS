import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/// CUIDs are used for all primary keys in the database, including spaceId.
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

const ALLOWED_ROLES = [
  'SPACE_MANAGER',
  'MEMBER',
] as const;

function spaceRoom(spaceId: string): string {
  return `space:${spaceId}`;
}

/// The EventsGateway is responsible for handling WebSocket connections and broadcasting events to clients.
@WebSocketGateway({
  cors: {
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

    // Validate the spaceId and role from the handshake.auth object
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

 
  emitBookingCreated(
    spaceId: string,
    payload: unknown,
  ): void {
    this.server
      .to(spaceRoom(spaceId))
      .emit('booking_created', payload);
  }
}