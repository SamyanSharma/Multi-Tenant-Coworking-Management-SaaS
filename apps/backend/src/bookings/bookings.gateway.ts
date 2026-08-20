// REFERENCE STUB — written by Prakriti (frontend) as a starting point for
// Arpit, matching the contract already documented in
// Stage5_Socket_Event_Contract.md and what apps/frontend/lib/socket.ts
// already sends on the `auth` handshake payload.
//
// NOT run or compiled — no network access to install @nestjs/websockets
// or socket.io in the environment this was written in. Treat every line
// here as needing your own verification, same as any other PR you'd
// review, not as tested code.
//
// Requires: npm install @nestjs/websockets @nestjs/platform-socket.io

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Same cuid check TenantGuard already uses for the HTTP side — kept in
// sync manually since there's no shared validation util between REST
// guards and this gateway yet. Consider extracting to a shared function
// if drift becomes a problem.
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

interface SocketAuthPayload {
  spaceId?: string;
  userRole?: string;
  userId?: string | null;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class BookingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BookingsGateway.name);

  handleConnection(client: Socket) {
    const auth = client.handshake.auth as SocketAuthPayload;
    const { spaceId } = auth;

    if (!spaceId || !CUID_REGEX.test(spaceId)) {
      this.logger.warn(`Rejected socket connection: invalid spaceId "${spaceId}"`);
      client.disconnect(true);
      return;
    }

    client.join(spaceId);
    this.logger.log(`Client ${client.id} joined space room ${spaceId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  emitBookingCreated(spaceId: string, booking: Record<string, unknown>) {
    this.server.to(spaceId).emit('booking_created', booking);
  }

  emitBookingCancelled(spaceId: string, bookingId: string) {
    this.server.to(spaceId).emit('booking_cancelled', { id: bookingId });
  }
}

/*
INTEGRATION SNIPPET — how BookingsService.create() would call this.
Not applied automatically since it changes an existing file you own;
paste in manually after reviewing.

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BookingsGateway, // add this
  ) {}

  async create(dto: CreateBookingDto, spaceId: string, userId: string) {
    // ...existing logic unchanged...
    const booking = await this.prisma.$transaction(async (tx) => {
      return tx.booking.create({
        data: { bookableType, bookableId, userId, startTime, endTime },
      });
    });

    this.gateway.emitBookingCreated(spaceId, booking); // add this line

    return booking;
  }

Also add BookingsGateway to bookings.module.ts's providers array:

  @Module({
    controllers: [BookingsController],
    providers: [BookingsService, BookingsGateway],
  })
  export class BookingsModule {}
*/
