// Originally drafted by Prakriti (frontend) as a starting point matching
// the contract documented in Stage5_Socket_Event_Contract.md and what
// apps/frontend/lib/socket.ts sends on the `auth` handshake payload — now
// wired into bookings.module.ts and called from bookings.service.ts's
// create(). Still needs a real boot + two-client test (see
// MASTER_PROMPT.md's "clean build isn't sufficient verification" rule)
// before being considered verified, same as any other endpoint.

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

// Same three values RbacGuard checks against on the REST side (see
// roles.decorator.ts / Role enum in @prisma/client) — kept as a literal
// list here rather than importing the Prisma enum, since this file may be
// compiled/reviewed before @prisma/client is generated in a fresh checkout.
const VALID_ROLES = ['PLATFORM_ADMIN', 'SPACE_MANAGER', 'MEMBER'];

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
    const { spaceId, userRole } = auth;

    if (!spaceId || !CUID_REGEX.test(spaceId)) {
      this.logger.warn(`Rejected socket connection: invalid spaceId "${spaceId}"`);
      client.disconnect(true);
      return;
    }

    if (!userRole || !VALID_ROLES.includes(userRole)) {
      this.logger.warn(`Rejected socket connection: invalid userRole "${userRole}"`);
      client.disconnect(true);
      return;
    }

    // NOTE: this confirms the role is *well-formed*, not that it's *true* —
    // same placeholder-auth limitation as TenantGuard/RbacGuard on the REST
    // side (see PROGRESS.md Open Questions). A client can still claim any
    // role or any correctly-shaped spaceId until real JWT auth replaces the
    // handshake payload. Not a regression introduced here, but flagged
    // again since this is a second surface depending on the same gap.
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
  @Module({
    controllers: [BookingsController],
    providers: [BookingsService, BookingsGateway],
  })
  export class BookingsModule {}
*/
