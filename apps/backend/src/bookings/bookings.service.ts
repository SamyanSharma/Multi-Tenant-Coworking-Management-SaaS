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

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_EXCLUSION_CONSTRAINT_VIOLATION = 'P2039';
const POSTGRES_EXCLUSION_VIOLATION = '23P01';

// How long a PENDING or FAILED (declined-but-not-yet-retried) booking
// holds its slot before it's treated as abandoned and released — same
// idea as a movie-ticket seat hold. 15 minutes chosen to match the
// new 15-minute time-slot granularity elsewhere in this change; not a
// value the person building this system stated, so worth revisiting
// if a different hold window is wanted.
const HOLD_DURATION_MINUTES = 15;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly stripeService: StripeService,
  ) {}

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
        throw new NotFoundException(
          'Desk not found in this space',
        );
      }

      return desk;
    }

    if (bookableType === BookableType.ROOM) {
      const room = await this.prisma.room.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });

      if (!room || room.zone.spaceId !== spaceId) {
        throw new NotFoundException(
          'Room not found in this space',
        );
      }

      return room;
    }

    throw new BadRequestException(
      `Unknown bookableType: ${bookableType}`,
    );
  }


  async findAllForSpace(spaceId: string) {
    // Stage 9: scoped by the Booking's own spaceId snapshot instead of
    // joining through live Desk/Room ids. That join would silently drop a
    // booking's history the moment its desk/room is (soft-)deleted; the
    // snapshot column keeps every booking visible to its space regardless.
    const bookings = await this.prisma.booking.findMany({
      where: { spaceId },
      // Baseline chronological order — no explicit orderBy previously,
      // meaning the API returned whatever order Postgres happened to
      // give back (effectively arbitrary, not something to rely on).
      // The frontend applies a smarter active/upcoming/completed
      // grouping on top of this for display, but the API itself
      // shouldn't hand back an unordered list.
      orderBy: { startTime: 'asc' },
    });

    const active = await this.expireStaleHolds(bookings);

    return this.reconcilePendingPayments(active);
  }

  // A held slot (PENDING or FAILED with holdExpiresAt in the past) is
  // deleted outright, not just hidden — leaving the row around would
  // still block that time range via the no_overlapping_bookings
  // exclusion constraint even though nobody's actually holding it
  // anymore, the exact bug this feature exists to prevent.
  private async expireStaleHolds<
    T extends {
      id: string;
      paymentStatus: string;
      holdExpiresAt: Date | null;
    },
  >(bookings: T[]): Promise<T[]> {
    const now = new Date();

    const expired = bookings.filter(
      (b) =>
        (b.paymentStatus === 'PENDING' || b.paymentStatus === 'FAILED') &&
        b.holdExpiresAt !== null &&
        b.holdExpiresAt < now,
    );

    if (expired.length === 0) {
      return bookings;
    }

    await this.prisma.booking.deleteMany({
      where: { id: { in: expired.map((b) => b.id) } },
    });

    const expiredIds = new Set(expired.map((b) => b.id));

    return bookings.filter((b) => !expiredIds.has(b.id));
  }

  // Self-heals bookings stuck at PENDING because
  // payment_intent.succeeded/failed never arrived — the same problem
  // account.updated had for onboarding status, fixed the same way:
  // actively ask Stripe instead of only trusting the webhook. Runs on
  // every list load; only PENDING rows with a stripePaymentIntentId
  // cost a Stripe API call, so this is cheap for a real class demo's
  // booking volume.
  private async reconcilePendingPayments<
    T extends {
      id: string;
      paymentStatus: string;
      stripePaymentIntentId: string | null;
    },
  >(bookings: T[]): Promise<T[]> {
    const pending = bookings.filter(
      (b) => b.paymentStatus === 'PENDING' && b.stripePaymentIntentId,
    );

    if (pending.length === 0) {
      return bookings;
    }

    const resolutions = await Promise.all(
      pending.map(async (booking) => {
        try {
          const { status, hasFailedAttempt } =
            await this.stripeService.getPaymentIntentStatus(
              booking.stripePaymentIntentId!,
            );

          let resolvedStatus: 'PAID' | 'FAILED' | null = null;

          if (status === 'succeeded') {
            resolvedStatus = 'PAID';
          } else if (
            status === 'canceled' ||
            (status === 'requires_payment_method' && hasFailedAttempt)
          ) {
            // requires_payment_method alone isn't necessarily a
            // failure — a brand-new, never-attempted PaymentIntent
            // starts in this exact status too. Only treat it as
            // FAILED once an attempt has actually been made and
            // declined (hasFailedAttempt).
            resolvedStatus = 'FAILED';
          }
          // Any other status (processing, requires_action,
          // requires_confirmation, requires_capture) is genuinely
          // still in progress — leave it PENDING.

          return resolvedStatus
            ? { id: booking.id, resolvedStatus }
            : null;
        } catch {
          // A Stripe lookup failing (rate limit, network blip)
          // shouldn't break the whole booking list — leave this one
          // PENDING and let the next list load retry it.
          return null;
        }
      }),
    );

    const toUpdate = resolutions.filter(
      (r): r is { id: string; resolvedStatus: 'PAID' | 'FAILED' } =>
        r !== null,
    );

    if (toUpdate.length === 0) {
      return bookings;
    }

    await Promise.all(
      toUpdate.map((update) =>
        this.prisma.booking.update({
          where: { id: update.id },
          data: {
            paymentStatus: update.resolvedStatus,
            // Only PAID clears the hold — FAILED still needs it (a
            // FAILED booking is still holding the slot until either
            // retried or its hold expires; see expireStaleHolds).
            holdExpiresAt:
              update.resolvedStatus === 'PAID' ? null : undefined,
            // Stage 9: revenue time windows key off paidAt.
            paidAt:
              update.resolvedStatus === 'PAID' ? new Date() : undefined,
          },
        }),
      ),
    );

    const resolvedById = new Map(
      toUpdate.map((update) => [update.id, update.resolvedStatus]),
    );

    return bookings.map((booking) =>
      resolvedById.has(booking.id)
        ? { ...booking, paymentStatus: resolvedById.get(booking.id)! }
        : booking,
    );
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


    if (
      new Date(startTime) >= new Date(endTime)
    ) {
      throw new BadRequestException(
        'startTime must be before endTime',
      );
    }


    const bookable = await this.resolveBookable(
      bookableType,
      bookableId,
      spaceId,
    );


    const space =
      await this.prisma.space.findUnique({
        where: {
          id: spaceId,
        },
        select: {
          priceCents: true,
        },
      });


    if (
      !space ||
      space.priceCents === null
    ) {
      throw new BadRequestException(
        'Booking price has not been configured for this space',
      );
    }



    const spaceManager =
      await this.prisma.user.findFirst({
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

    // Free up any abandoned hold on this exact resource first — a
    // PENDING booking nobody ever paid for (or a FAILED one nobody
    // retried) would otherwise still block this create() attempt via
    // the DB's exclusion constraint even though it's long abandoned.
    await this.prisma.booking.deleteMany({
      where: {
        bookableType,
        bookableId,
        paymentStatus: { in: ['PENDING', 'FAILED'] },
        holdExpiresAt: { lt: new Date() },
      },
    });

    try {


      const booking =
        await this.prisma.$transaction(
          async (tx) => {

            return tx.booking.create({
              data: {
                bookableType,
                bookableId,
                userId,
                startTime,
                endTime,
                amountCents:
                  space.priceCents,
                // Stage 9 snapshots: financial history must not depend on
                // the live Desk/Room row (which may later be soft-deleted).
                spaceId,
                bookableName: bookable.name,
              },
            });

          },
        );



      let updatedBooking = booking;
      let clientSecret: string | null = null;



      if (
        spaceManager.stripeAccountId &&
        spaceManager.stripeOnboardingComplete
      ) {

        try {
          const result = await this.createAndAttachPaymentIntent(
            booking.id,
            space.priceCents,
            spaceManager.stripeAccountId,
          );

          updatedBooking = result.booking;
          clientSecret = result.clientSecret;
        } catch {

          /*
            Payment setup failed.

            Remove booking because a failed
            payment should not block the slot.
          */

          await this.prisma.booking.delete({
            where: {
              id: booking.id,
            },
          });


          throw new ConflictException(
            'Could not setup payment for booking',
          );
        }
      }



      this.eventsGateway.emitBookingCreated(
        spaceId,
        updatedBooking,
      );


      // clientSecret is NOT a Booking column — it's Stripe's ephemeral
      // token for confirming this specific PaymentIntent client-side
      // (via Stripe.js). Returned once here so the frontend can
      // immediately render a payment form; it is never persisted or
      // returned again from any other endpoint (e.g. GET /bookings).
      return { ...updatedBooking, clientSecret };



       } catch (err: unknown) {

      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION;

      const isExclusionViolation =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (
          err.code === PRISMA_EXCLUSION_CONSTRAINT_VIOLATION ||
          (err as any).meta?.code ===
            POSTGRES_EXCLUSION_VIOLATION ||
          (err as any).meta?.driverAdapterError?.cause
            ?.originalCode === POSTGRES_EXCLUSION_VIOLATION
        );

      if (isUniqueViolation || isExclusionViolation) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      throw err;
    }
  }

  // Lets a Member re-attempt payment on their own booking after a
  // card decline (paymentStatus FAILED), or complete payment on a
  // booking that was created UNPAID because the Space Manager hadn't
  // finished Stripe onboarding yet at booking time and has since done
  // so. Does NOT touch PAID bookings (nothing to retry) or PENDING
  // ones (a PaymentIntent is already awaiting confirmation for those
  // — creating a second one would let the same slot get double-billed
  // if both were ever confirmed).
  async retryPayment(
    bookingId: string,
    spaceId: string,
    userId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new BadRequestException(
        'You can only retry payment on your own booking',
      );
    }

    // Confirms the booking's bookable actually belongs to this
    // tenant — same tenant-isolation check create() does via
    // resolveBookable, applied here since retryPayment is reached by
    // booking id alone, not scoped by a spaceId path segment.
    await this.resolveBookable(
      booking.bookableType,
      booking.bookableId,
      spaceId,
    );

    if (booking.paymentStatus === 'PAID') {
      throw new BadRequestException('This booking is already paid');
    }

    if (booking.paymentStatus === 'PENDING') {
      throw new BadRequestException(
        'A payment is already in progress for this booking — check your email or wait a moment and refresh',
      );
    }

    if (
      booking.paymentStatus === 'FAILED' &&
      booking.holdExpiresAt &&
      booking.holdExpiresAt < new Date()
    ) {
      // The hold already lapsed — don't quietly resurrect it with a
      // fresh PaymentIntent, since someone else may have booked this
      // slot in the meantime. Delete it and tell them to start over,
      // same as the automatic expiry paths in create()/findAllForSpace.
      await this.prisma.booking.delete({ where: { id: booking.id } });
      throw new BadRequestException(
        'Your hold on this slot expired — please book again.',
      );
    }

    if (booking.amountCents === null) {
      throw new BadRequestException(
        'This booking has no price attached — cannot create a payment',
      );
    }

    const spaceManager = await this.prisma.user.findFirst({
      where: { spaceId, role: 'SPACE_MANAGER' },
      select: {
        stripeAccountId: true,
        stripeOnboardingComplete: true,
      },
    });

    if (
      !spaceManager?.stripeAccountId ||
      !spaceManager.stripeOnboardingComplete
    ) {
      throw new BadRequestException(
        'This space is not yet set up to accept payments',
      );
    }

    const { booking: updatedBooking, clientSecret } =
      await this.createAndAttachPaymentIntent(
        booking.id,
        booking.amountCents,
        spaceManager.stripeAccountId,
      );

    return { ...updatedBooking, clientSecret };
  }

  private async createAndAttachPaymentIntent(
    bookingId: string,
    amountCents: number,
    connectedAccountId: string,
  ) {
    const paymentIntent =
      await this.stripeService.createBookingPaymentIntent({
        amountCents,
        connectedAccountId,
        bookingId,
      });

    const booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PENDING',
        stripePaymentIntentId: paymentIntent.id,
        // Stage 9: the exact application fee this PaymentIntent was created
        // with -- read back from Stripe's object rather than recomputed, so
        // the stored number can never disagree with what was really charged.
        platformFeeCents: paymentIntent.application_fee_amount ?? null,
        // Refreshed on every call, including retries — a retry means
        // the user is actively engaged right now, so they get a full
        // fresh window rather than inheriting whatever was left of
        // the original hold (which may already be seconds from
        // expiring, undermining the point of letting them retry).
        holdExpiresAt: new Date(
          Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
        ),
      },
    });

    return { booking, clientSecret: paymentIntent.client_secret };
  }
}
