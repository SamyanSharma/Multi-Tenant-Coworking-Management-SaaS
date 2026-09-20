import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/auth.service';

const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

const ALLOWED_ROLES = [
  'SPACE_MANAGER',
  'MEMBER',
] as const;

function spaceRoom(spaceId: string): string {
  return `space:${spaceId}`;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  @WebSocketServer()
  server!: Server;

  // Previously trusted handshake.auth.spaceId/.role directly — any
  // client could join any tenant's room just by claiming its id. Now
  // the client sends a real JWT (handshake.auth.token, the same token
  // from POST /auth/login) and spaceId/role come from verifying it,
  // the same as JwtAuthGuard does for REST requests.
  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as
      | string
      | undefined;

    if (!token) {
      this.rejectConnection(client, 'Missing auth token');
      return;
    }

    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.rejectConnection(client, 'Invalid or expired token');
      return;
    }

    const { spaceId, role } = payload;

    if (
      !spaceId ||
      !CUID_REGEX.test(spaceId) ||
      !ALLOWED_ROLES.includes(
        role as (typeof ALLOWED_ROLES)[number],
      )
    ) {
      this.rejectConnection(
        client,
        'Token has no valid spaceId/role for a real-time connection',
      );
      return;
    }

    client.join(spaceRoom(spaceId));

    this.logger.log(
      `Socket ${client.id} joined ${spaceRoom(spaceId)} as ${role}`,
    );
  }

  private rejectConnection(client: Socket, message: string): void {
    this.logger.warn(
      `Rejecting socket ${client.id}: ${message}`,
    );

    client.emit('connection_error', { message });
    client.disconnect(true);
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

  // Stage 9: lifecycle events (`resource_deleted`, `booking_cancelled`,
  // `space_closed`) go to the same per-space room as booking_created, so
  // every open floor plan in that tenant updates without a refresh.
  emitToSpace(
    spaceId: string,
    event: string,
    payload: unknown,
  ): void {
    this.server.to(spaceRoom(spaceId)).emit(event, payload);
  }
}
