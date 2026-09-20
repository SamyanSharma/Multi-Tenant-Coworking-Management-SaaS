import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookableType,
  CancellationReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { EventsGateway } from '../events/events.gateway';
import { LIVE } from '../common/live';

export type DeletableType = 'DESK' | 'ROOM' | 'ZONE';

interface ResolvedTarget {
  type: DeletableType;
  id: string;
  name: string;
  deskIds: string[];
  roomIds: string[];
}

export interface DeleteImpact {
  target: { type: DeletableType; id: string; name: string };
  children: { desks: number; rooms: number };
  activeBookings: {
    count: number;
    paid: number;
    unpaid: number;
    holds: number;
    refundTotalCents: number;
  };
}

interface ActiveBooking {
  id: string;
  bookableType: BookableType;
  bookableId: string;
  paymentStatus: string;
  amountCents: number | null;
  stripePaymentIntentId: string | null;
}

const ACTIVE_BOOKING_SELECT = {
  id: true,
  bookableType: true,
  bookableId: true,
  paymentStatus: true,
  amountCents: true,
  stripePaymentIntentId: true,
} as const;

type Db = Prisma.TransactionClient;

/**
 * Stage 9: soft delete of Desk / Room / Zone with cancel-and-refund.
 *
 * Shape of a delete (see ARCHITECTURE.md, "Stage 9 design"):
 *  1. ONE database transaction, no network calls inside it:
 *       - re-check the target belongs to the caller's space and is live,
 *       - find the ACTIVE bookings on it (upcoming, not cancelled),
 *       - if there are some and the caller did not confirm -> 409 + impact,
 *       - soft-delete the target and its whole subtree (same timestamp),
 *       - mark each active booking cancelled; PAID ones go to REFUND_PENDING.
 *  2. AFTER commit, per booking and failure-isolated: cancel the open
 *     PaymentIntent / issue the Stripe refund (idempotent), then record the
 *     outcome. A refund that fails is REFUND_FAILED and can be retried; the
 *     deletion itself is never rolled back because of Stripe.
 *  3. Broadcast socket events so open floor plans update.
 *
 * Why "intent first, side effects after": a DB transaction cannot include a
 * Stripe call. Committing the intent (REFUND_PENDING) first means a crash
 * between the two steps leaves a visible, retryable state instead of a
 * half-deleted, half-refunded one.
 */
@Injectable()
export class DeletionService {
  private readonly logger = new Logger(DeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // ---------------------------------------------------------------- preview

  async getImpact(
    type: DeletableType,
    id: string,
    spaceId: string,
  ): Promise<DeleteImpact> {
    const target = await this.resolveTarget(this.prisma, type, id, spaceId);
    const active = await this.findActiveBookings(
      this.prisma,
      spaceId,
      target,
      new Date(),
    );
    return this.buildImpact(target, active);
  }

  // ----------------------------------------------------------------- delete

  async remove(
    type: DeletableType,
    id: string,
    spaceId: string,
    opts: { confirmRefund: boolean },
  ) {
    const now = new Date();

    const { target, cancelled } = await this.prisma.$transaction(
      async (tx) => {
        const target = await this.resolveTarget(tx, type, id, spaceId);
        const active = await this.findActiveBookings(
          tx,
          spaceId,
          target,
          now,
        );

        if (active.length > 0 && !opts.confirmRefund) {
          throw new ConflictException({
            code: 'ACTIVE_BOOKINGS',
            message:
              'There are upcoming bookings on this. Confirm to cancel them and refund the customers.',
            impact: this.buildImpact(target, active),
          });
        }

        await this.softDeleteSubtree(tx, target, spaceId, now);

        const paidIds = active
          .filter((b) => b.paymentStatus === 'PAID')
          .map((b) => b.id);
        const otherIds = active
          .filter((b) => b.paymentStatus !== 'PAID')
          .map((b) => b.id);

        const reason = CancellationReason.RESOURCE_DELETED;

        if (paidIds.length > 0) {
          await tx.booking.updateMany({
            where: { id: { in: paidIds } },
            data: {
              paymentStatus: 'REFUND_PENDING',
              cancelledAt: now,
              cancellationReason: reason,
              holdExpiresAt: null,
            },
          });
        }

        if (otherIds.length > 0) {
          await tx.booking.updateMany({
            where: { id: { in: otherIds } },
            data: {
              cancelledAt: now,
              cancellationReason: reason,
              holdExpiresAt: null,
            },
          });
        }

        return { target, cancelled: active };
      },
    );

    // ---- after commit: money + notifications (never inside the tx)
    const refunds = await this.settleCancelledBookings(cancelled);

    this.safeEmit(spaceId, 'resource_deleted', {
      type: target.type,
      id: target.id,
      deskIds: target.deskIds,
      roomIds: target.roomIds,
    });
    for (const b of cancelled) {
      this.safeEmit(spaceId, 'booking_cancelled', {
        id: b.id,
        bookableType: b.bookableType,
        bookableId: b.bookableId,
      });
    }

    return {
      deleted: { type: target.type, id: target.id, name: target.name },
      cancelledBookings: cancelled.length,
      refunds,
    };
  }

  // ------------------------------------------------------------ retry refund

  async retryRefund(bookingId: string, spaceId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        spaceId,
        cancelledAt: { not: null },
        paymentStatus: { in: ['REFUND_FAILED', 'REFUND_PENDING'] },
        stripePaymentIntentId: { not: null },
      },
    });

    if (!booking) {
      throw new NotFoundException(
        'No refund waiting for a retry on this booking',
      );
    }

    const ok = await this.refundOne(
      booking.id,
      booking.stripePaymentIntentId!,
    );

    const updated = await this.prisma.booking.findUnique({
      where: { id: booking.id },
      select: {
        id: true,
        paymentStatus: true,
        refundedAmountCents: true,
        stripeRefundId: true,
      },
    });

    return { ok, booking: updated };
  }

  // --------------------------------------------------------------- internals

  private async resolveTarget(
    db: Db,
    type: DeletableType,
    id: string,
    spaceId: string,
  ): Promise<ResolvedTarget> {
    if (type === 'DESK') {
      const desk = await db.desk.findUnique({
        where: { id },
        include: { zone: true },
      });
      // 404 (not 403) for another tenant's id: don't confirm it exists.
      if (!desk || desk.deletedAt || desk.zone.spaceId !== spaceId) {
        throw new NotFoundException('Desk not found in this space');
      }
      return { type, id, name: desk.name, deskIds: [id], roomIds: [] };
    }

    if (type === 'ROOM') {
      const room = await db.room.findUnique({
        where: { id },
        include: { zone: true },
      });
      if (!room || room.deletedAt || room.zone.spaceId !== spaceId) {
        throw new NotFoundException('Room not found in this space');
      }
      return { type, id, name: room.name, deskIds: [], roomIds: [id] };
    }

    const zone = await db.zone.findUnique({
      where: { id },
      include: {
        desks: { where: LIVE, select: { id: true } },
        rooms: { where: LIVE, select: { id: true } },
      },
    });
    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
      throw new NotFoundException('Zone not found in this space');
    }
    return {
      type,
      id,
      name: zone.name,
      deskIds: zone.desks.map((d) => d.id),
      roomIds: zone.rooms.map((r) => r.id),
    };
  }

  // "Active" = upcoming, not already cancelled, and either paid/unpaid or a
  // payment hold that has not expired yet. Past bookings never block a
  // delete, and neither do expired holds (nobody is holding that slot).
  private async findActiveBookings(
    db: Db,
    spaceId: string,
    target: ResolvedTarget,
    now: Date,
  ): Promise<ActiveBooking[]> {
    const resourceOr: Prisma.BookingWhereInput[] = [];
    if (target.deskIds.length > 0) {
      resourceOr.push({
        bookableType: BookableType.DESK,
        bookableId: { in: target.deskIds },
      });
    }
    if (target.roomIds.length > 0) {
      resourceOr.push({
        bookableType: BookableType.ROOM,
        bookableId: { in: target.roomIds },
      });
    }
    if (resourceOr.length === 0) return [];

    return db.booking.findMany({
      where: {
        spaceId,
        cancelledAt: null,
        endTime: { gt: now },
        AND: [
          { OR: resourceOr },
          {
            OR: [
              { paymentStatus: { in: ['PAID', 'UNPAID'] } },
              {
                paymentStatus: { in: ['PENDING', 'FAILED'] },
                holdExpiresAt: { gt: now },
              },
            ],
          },
        ],
      },
      select: ACTIVE_BOOKING_SELECT,
      orderBy: { startTime: 'asc' },
    });
  }

  private buildImpact(
    target: ResolvedTarget,
    active: ActiveBooking[],
  ): DeleteImpact {
    const paid = active.filter((b) => b.paymentStatus === 'PAID');
    return {
      target: { type: target.type, id: target.id, name: target.name },
      children: {
        desks: target.type === 'ZONE' ? target.deskIds.length : 0,
        rooms: target.type === 'ZONE' ? target.roomIds.length : 0,
      },
      activeBookings: {
        count: active.length,
        paid: paid.length,
        unpaid: active.filter((b) => b.paymentStatus === 'UNPAID').length,
        holds: active.filter(
          (b) => b.paymentStatus === 'PENDING' || b.paymentStatus === 'FAILED',
        ).length,
        refundTotalCents: paid.reduce(
          (sum, b) => sum + (b.amountCents ?? 0),
          0,
        ),
      },
    };
  }

  // Same `deletedAt` for the target and every descendant, so the invariant
  // "a live row never has a deleted ancestor" holds (see common/live.ts).
  // The count check makes two concurrent deletes of the same thing safe: the
  // loser matches zero rows and gets a 404 instead of double-processing.
  private async softDeleteSubtree(
    tx: Db,
    target: ResolvedTarget,
    spaceId: string,
    now: Date,
  ) {
    if (target.type === 'DESK') {
      const r = await tx.desk.updateMany({
        where: { id: target.id, ...LIVE, zone: { spaceId } },
        data: { deletedAt: now },
      });
      if (r.count !== 1) throw new NotFoundException('Desk not found in this space');
      return;
    }

    if (target.type === 'ROOM') {
      const r = await tx.room.updateMany({
        where: { id: target.id, ...LIVE, zone: { spaceId } },
        data: { deletedAt: now },
      });
      if (r.count !== 1) throw new NotFoundException('Room not found in this space');
      return;
    }

    const z = await tx.zone.updateMany({
      where: { id: target.id, spaceId, ...LIVE },
      data: { deletedAt: now },
    });
    if (z.count !== 1) throw new NotFoundException('Zone not found in this space');

    await tx.desk.updateMany({
      where: { zoneId: target.id, ...LIVE },
      data: { deletedAt: now },
    });
    await tx.room.updateMany({
      where: { zoneId: target.id, ...LIVE },
      data: { deletedAt: now },
    });
  }

  private async settleCancelledBookings(cancelled: ActiveBooking[]) {
    let succeeded = 0;
    let failed = 0;
    let refundedCents = 0;

    // Sequential on purpose: a handful of bookings, and it keeps Stripe
    // request bursts (and log ordering) predictable.
    for (const b of cancelled) {
      if (b.paymentStatus === 'PAID' && b.stripePaymentIntentId) {
        const ok = await this.refundOne(b.id, b.stripePaymentIntentId);
        if (ok) {
          succeeded++;
          refundedCents += b.amountCents ?? 0;
        } else {
          failed++;
        }
        continue;
      }

      if (
        (b.paymentStatus === 'PENDING' || b.paymentStatus === 'FAILED') &&
        b.stripePaymentIntentId
      ) {
        await this.releasePendingPayment(b);
        // If the member paid in the instant before we cancelled, that money
        // was picked up as a refund inside releasePendingPayment; count it.
        const now = await this.prisma.booking.findUnique({
          where: { id: b.id },
          select: { paymentStatus: true, refundedAmountCents: true },
        });
        if (now?.paymentStatus === 'REFUNDED') {
          succeeded++;
          refundedCents += now.refundedAmountCents ?? 0;
        } else if (now?.paymentStatus === 'REFUND_FAILED') {
          failed++;
        }
      }
    }

    return { succeeded, failed, refundedCents };
  }

  // A held (PENDING/FAILED) booking has an open PaymentIntent the member
  // could still pay. Cancel it. If it turns out the member already paid,
  // treat the booking like a paid one and refund.
  private async releasePendingPayment(b: ActiveBooking) {
    try {
      const outcome = await this.stripeService.cancelPaymentIntent(
        b.stripePaymentIntentId!,
      );

      if (outcome === 'succeeded') {
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { paymentStatus: 'REFUND_PENDING', paidAt: new Date() },
        });
        await this.refundOne(b.id, b.stripePaymentIntentId!);
        return;
      }

      if (outcome === 'canceled') {
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { paymentStatus: 'FAILED' },
        });
      }
    } catch (err) {
      // Stripe unreachable etc. The booking is already cancelled in our DB
      // and reconcile skips cancelled rows; log so it can be chased.
      this.logger.error(
        `Could not cancel PaymentIntent ${b.stripePaymentIntentId} for cancelled booking ${b.id}: ${String(err)}`,
      );
    }
  }

  private async refundOne(
    bookingId: string,
    paymentIntentId: string,
  ): Promise<boolean> {
    try {
      const refund = await this.stripeService.refundBookingPayment(
        paymentIntentId,
        bookingId,
      );

      const issued = ['succeeded', 'pending', 'requires_action'].includes(
        refund.status,
      );

      await this.prisma.booking.update({
        where: { id: bookingId },
        data: issued
          ? {
              paymentStatus: 'REFUNDED',
              stripeRefundId: refund.id,
              refundedAmountCents: refund.amount,
            }
          : { paymentStatus: 'REFUND_FAILED' },
      });

      return issued;
    } catch (err) {
      this.logger.error(
        `Refund failed for booking ${bookingId} (${paymentIntentId}): ${String(err)}`,
      );
      try {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: 'REFUND_FAILED' },
        });
      } catch (inner) {
        this.logger.error(
          `Could not record REFUND_FAILED for ${bookingId}: ${String(inner)}`,
        );
      }
      return false;
    }
  }

  private safeEmit(spaceId: string, event: string, payload: unknown) {
    try {
      this.eventsGateway.emitToSpace(spaceId, event, payload);
    } catch (err) {
      this.logger.warn(`Could not emit ${event}: ${String(err)}`);
    }
  }
}
