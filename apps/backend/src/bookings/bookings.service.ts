import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { BookableType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';
import { StripeService } from '../payments/stripe.service';

// Prisma's unique-constraint-violation error code.
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Resolves bookableId -> the actual Desk or Room, and confirms it
   * belongs to the caller's space.
   */
  private async resolveBookable(
    bookableType: BookableType,
    bookableId: string,
    spaceId: string,
  ) {
    if (bookableType === BookableType.DESK) {
      const desk = await this.prisma.desk.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });

      if (!desk || desk.zone.spaceId !== spaceId) {
        throw new NotFoundException('Desk not found in this space');
      }

      return desk;
    }

    if (bookableType === BookableType.ROOM) {
      const room = await this.prisma.room.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });

      if (!room || room.zone.spaceId !== spaceId) {
        throw new NotFoundException('Room not found in this space');
      }

      return room;
    }

    throw new BadRequestException(
      `Unknown bookableType: ${bookableType}`,
    );
  }

  async findAllForSpace(spaceId: string) {
    const [desks, rooms] = await Promise.all([
      this.prisma.desk.findMany({
        where: { zone: { spaceId } },
        select: { id: true },
      }),
      this.prisma.room.findMany({
        where: { zone: { spaceId } },
        select: { id: true },
      }),
    ]);

    const deskIds = desks.map((d) => d.id);
    const roomIds = rooms.map((r) => r.id);

    return this.prisma.booking.findMany({
      where: {
        OR: [
          {
            bookableType: BookableType.DESK,
            bookableId: { in: deskIds },
          },
          {
            bookableType: BookableType.ROOM,
            bookableId: { in: roomIds },
          },
        ],
      },
    });
  }

  async create(
    dto: CreateBookingDto,
    spaceId: string,
    userId: string,
  ) {
    const {
      bookableType,
      bookableId,
      startTime,
      endTime,
    } = dto;

    // Validate the booking time range.
    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException(
        'startTime must be before endTime',
      );
    }

    // Confirm that the Desk/Room exists and belongs to this tenant.
    await this.resolveBookable(
      bookableType,
      bookableId,
      spaceId,
    );

    // Read the Space's current server-side booking price.
    //
    // The client does NOT provide the amount. This prevents a member
    // from changing the booking price in the request body.
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { priceCents: true },
    });

    if (!space || space.priceCents === null) {
      throw new BadRequestException(
        'Booking price has not been configured for this space',
      );
    }

    // Find the Space Manager responsible for this tenant.
    const spaceManager = await this.prisma.user.findFirst({
      where: {
        spaceId,
        role: 'SPACE_MANAGER',
      },
      select: {
        id: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
      },
    });

    if (!spaceManager) {
      throw new BadRequestException(
        'No Space Manager is configured for this space',
      );
    }

    // A Stripe Connect account is required for the 95/5 destination charge.
    if (!spaceManager.stripeAccountId) {
      throw new BadRequestException(
        'Space Manager has not connected a Stripe account',
      );
    }

    // The Connect account must have completed onboarding.
    if (!spaceManager.stripeOnboardingComplete) {
      throw new BadRequestException(
        'Space Manager has not completed Stripe onboarding',
      );
    }

    try {
      /*
       * Create the booking first.
       *
       * amountCents is copied from Space.priceCents so future changes
       * to the Space price do not alter this booking's historical price.
       *
       * The database exclusion/unique constraints protect against
       * overlapping or duplicate bookings.
       */
      const booking = await this.prisma.$transaction(async (tx) => {
        return tx.booking.create({
          data: {
            bookableType,
            bookableId,
            userId,
            startTime,
            endTime,
            amountCents: space.priceCents,
          },
        });
      });

      /*
       * Create the Stripe PaymentIntent using the Space Manager's
       * connected account.
       *
       * StripeService handles the 95/5 split:
       *   - 5% platform fee
       *   - 95% transferred to the Space Manager
       *
       * bookingId is stored in Stripe metadata so the webhook can
       * identify this Booking when payment succeeds.
       */
      let updatedBooking;
      try {
        const paymentIntent =
          await this.stripeService.createBookingPaymentIntent({
            amountCents: space.priceCents,
            connectedAccountId: spaceManager.stripeAccountId,
            bookingId: booking.id,
          });

        /*
         * Save the Stripe PaymentIntent ID immediately.
         *
         * PENDING means the PaymentIntent has been created but Stripe
         * has not yet confirmed successful payment.
         */
        updatedBooking = await this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'PENDING',
            stripePaymentIntentId: paymentIntent.id,
          },
        });
      } catch (paymentErr) {
        /*
         * booking.create() above already committed in its own
         * transaction, so a failure here (Stripe API error, network
         * blip, bad connected-account state) leaves a booking row with
         * no PaymentIntent behind unless we clean it up ourselves.
         *
         * That's not just clutter: the row still holds this desk/room's
         * startTime/endTime, so the overlap-exclusion constraint would
         * falsely reject a real future booking attempt for the exact
         * same slot, even though this attempt never got a working
         * payment. Delete it so the slot is genuinely free again, then
         * surface a clear error instead of the raw Stripe error.
         */
        await this.prisma.booking.delete({ where: { id: booking.id } });

        throw new ConflictException(
          'Could not set up payment for this booking. Please try again.',
        );
      }

      /*
       * Notify connected clients only after the database contains
       * the complete booking/payment state.
       */
      this.eventsGateway.emitBookingCreated(
        spaceId,
        updatedBooking,
      );

      return updatedBooking;
    } catch (err: unknown) {
      /*
       * PostgreSQL/Prisma unique constraint violations mean that
       * the requested booking conflicts with an existing booking.
       *
       * 409 Conflict is used instead of 403 Forbidden because this
       * is a resource-state conflict, not a permissions failure.
       */
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      /*
       * The `no_overlapping_bookings` EXCLUDE constraint (see
       * prisma/migrations/20260821202823_add_booking_overlap_exclusion)
       * is raw SQL, not something `schema.prisma` declares as a
       * `@@unique` — so Prisma doesn't recognize its Postgres error
       * code (23P01) as one of its own known codes the way it does
       * P2002. In practice this usually surfaces as a
       * PrismaClientUnknownRequestError, with the real Postgres SQLSTATE
       * embedded in the raw error message/meta rather than a clean
       * `.code` field the way P2002 works.
       *
       * ⚠️ NOT EMPIRICALLY VERIFIED — this repo's build tooling
       * (Prisma's schema/query-engine binaries) requires network access
       * this environment's sandbox doesn't allow, so this branch could
       * not be exercised against a real overlapping-booking request
       * here. Before trusting this in the demo: create two genuinely
       * overlapping bookings for the same desk locally, log the caught
       * error's constructor name and full `.message`/`.meta` once, and
       * confirm this actually matches — then this comment can be
       * deleted. See PROGRESS.md's Open Questions.
       */
      const isExclusionViolation =
        (err instanceof Prisma.PrismaClientUnknownRequestError ||
          err instanceof Prisma.PrismaClientKnownRequestError) &&
        /23P01|no_overlapping_bookings/.test(
          (err as { message?: string }).message ?? '',
        );

      if (isExclusionViolation) {
        throw new ConflictException(
          'This slot overlaps with an existing booking.',
        );
      }

      throw err;
    }
  }
}
