import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { BookableType, PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';
import { StripeService } from '../payments/stripe.service';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_EXCLUSION_CONSTRAINT_VIOLATION = 'P2039';
const POSTGRES_EXCLUSION_VIOLATION = '23P01';

const HOLD_DURATION_MINUTES = 15;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

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

      if (!desk || desk.deletedAt || desk.zone.spaceId !== spaceId) {
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

      if (!room || room.deletedAt || room.zone.spaceId !== spaceId) {
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

  
  private calculateAmountCents(
    bookable: { hourlyRateCents: number | null; dailyRateCents: number | null },
    startTime: Date,
    endTime: Date,
    fallbackFlatPriceCents: number | null,
  ): number {
    const { hourlyRateCents, dailyRateCents } = bookable;

    if (hourlyRateCents == null && dailyRateCents == null) {
      if (fallbackFlatPriceCents == null) {
        throw new BadRequestException(
          'Booking price has not been configured for this desk/room',
        );
      }
      return fallbackFlatPriceCents;
    }

    const durationMinutes = Math.round(
      (endTime.getTime() - startTime.getTime()) / (60 * 1000),
    );
    const durationHours = durationMinutes / 60;

    // Daily rate only: every started day is billed as a full day.
    if (hourlyRateCents == null) {
      const days = Math.max(1, Math.ceil(durationHours / 24));
      return dailyRateCents! * days;
    }

    // Billed in 15-minute blocks, rounded UP, minimum one block (15 min).
    // A flat 1-hour minimum was too coarse — it charged a 15-minute
    // booking the same as a 59-minute one. Quarter-hour granularity still
    // rounds in the platform's favor (never down), just with a finer
    // grain. totalHours stays a multiple of 0.25 from here on, e.g. a
    // 20-minute stay becomes 2 blocks -> 0.5h, not 1h.
    const billableQuarterHours = Math.max(1, Math.ceil(durationMinutes / 15));
    const totalHours = billableQuarterHours / 4;

    // Hourly rate only.
    if (dailyRateCents == null) {
      return Math.round(hourlyRateCents * totalHours);
    }

    
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours - days * 24;
    const hourlyOnly = hourlyRateCents * totalHours;
    const daysPlusHours =
      days * dailyRateCents + remainingHours * hourlyRateCents;

    // Round once, at the end, since quarter-hour fractions of a cents
    // rate (e.g. 333c/hr x 0.25h) aren't always a whole number of cents.
    return Math.round(Math.min(hourlyOnly, daysPlusHours));
  }


  async findAllForSpace(spaceId: string, scopeToUserId?: string) {
    
    const bookings = await this.prisma.booking.findMany({
      where: {
        spaceId,
        ...(scopeToUserId ? { userId: scopeToUserId } : {}),
      },
      
      orderBy: { startTime: 'asc' },
    });

    const active = await this.expireStaleHolds(bookings);
    const reconciled = await this.reconcilePendingPayments(active);

    return this.attachDisplayFields(reconciled);
  }

  
  private async attachDisplayFields<
    T extends {
      userId: string;
      bookableType: BookableType;
      bookableId: string;
    },
  >(bookings: T[]) {
    if (bookings.length === 0) {
      return [] as (T & {
        userName: string | null;
        userEmail: string | null;
        zoneName: string | null;
        spaceName: string | null;
      })[];
    }

    const userIds = [...new Set(bookings.map((b) => b.userId))];
    const deskIds = [
      ...new Set(
        bookings
          .filter((b) => b.bookableType === BookableType.DESK)
          .map((b) => b.bookableId),
      ),
    ];
    const roomIds = [
      ...new Set(
        bookings
          .filter((b) => b.bookableType === BookableType.ROOM)
          .map((b) => b.bookableId),
      ),
    ];

    const [users, desks, rooms] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      deskIds.length
        ? this.prisma.desk.findMany({
            where: { id: { in: deskIds } },
            select: {
              id: true,
              zone: { select: { name: true, space: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
      roomIds.length
        ? this.prisma.room.findMany({
            where: { id: { in: roomIds } },
            select: {
              id: true,
              zone: { select: { name: true, space: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const zoneNameByBookableId = new Map<string, string>();
    const spaceNameByBookableId = new Map<string, string>();
    for (const d of desks) {
      zoneNameByBookableId.set(d.id, d.zone.name);
      spaceNameByBookableId.set(d.id, d.zone.space.name);
    }
    for (const r of rooms) {
      zoneNameByBookableId.set(r.id, r.zone.name);
      spaceNameByBookableId.set(r.id, r.zone.space.name);
    }

    return bookings.map((b) => ({
      ...b,
      userName: userById.get(b.userId)?.name ?? null,
      userEmail: userById.get(b.userId)?.email ?? null,
      zoneName: zoneNameByBookableId.get(b.bookableId) ?? null,
      spaceName: spaceNameByBookableId.get(b.bookableId) ?? null,
    }));
  }

  
  private async releaseExpiredHolds(
    rows: { id: string; stripePaymentIntentId: string | null }[],
  ): Promise<Set<string>> {
    const released = new Set<string>();

    for (const row of rows) {
      if (!row.stripePaymentIntentId) {
        released.add(row.id);
        continue;
      }

      try {
        const outcome = await this.stripeService.cancelPaymentIntent(
          row.stripePaymentIntentId,
        );

        if (outcome === 'succeeded') {
          await this.prisma.booking.updateMany({
            where: {
              id: row.id,
              paymentStatus: { in: ['PENDING', 'FAILED'] },
            },
            data: {
              paymentStatus: 'PAID',
              holdExpiresAt: null,
              paidAt: new Date(),
            },
          });
          continue;
        }

        released.add(row.id);
      } catch (err) {
        this.logger.warn(
          `Could not cancel PaymentIntent ${row.stripePaymentIntentId} for ` +
            `expired booking ${row.id}; keeping the hold and retrying later: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    if (released.size > 0) {
      await this.prisma.booking.deleteMany({
        where: { id: { in: [...released] } },
      });
    }

    return released;
  }

 
  private async expireStaleHolds<
    T extends {
      id: string;
      paymentStatus: string;
      holdExpiresAt: Date | null;
      stripePaymentIntentId?: string | null;
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

    const releasedIds = await this.releaseExpiredHolds(
      expired.map((b) => ({
        id: b.id,
        stripePaymentIntentId: b.stripePaymentIntentId ?? null,
      })),
    );

    return bookings.filter((b) => !releasedIds.has(b.id));
  }

  private async reconcilePendingPayments<
    T extends {
      id: string;
      paymentStatus: string;
      stripePaymentIntentId: string | null;
      cancelledAt?: Date | null;
    },
  >(bookings: T[]): Promise<T[]> {
    // Stage 9: a cancelled booking (its desk/room was deleted) must never be
    // "healed" back to PAID by a late Stripe status -- the deletion flow owns
    // that money (refund or PaymentIntent cancel).
    const pending = bookings.filter(
      (b) =>
        b.paymentStatus === 'PENDING' &&
        b.stripePaymentIntentId &&
        !b.cancelledAt,
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

   
    if (bookable.zone.isActive === false) {
      throw new BadRequestException(
        'This zone is currently inactive and cannot be booked',
      );
    }


    const space =
      await this.prisma.space.findUnique({
        where: {
          id: spaceId,
        },
        select: {
          priceCents: true,
        },
      });


    const amountCents = this.calculateAmountCents(
      bookable,
      new Date(startTime),
      new Date(endTime),
      space?.priceCents ?? null,
    );


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

   
    const staleHolds = await this.prisma.booking.findMany({
      where: {
        bookableType,
        bookableId,
        paymentStatus: { in: ['PENDING', 'FAILED'] },
        holdExpiresAt: { lt: new Date() },
      },
      select: { id: true, stripePaymentIntentId: true },
    });
    if (staleHolds.length > 0) {
      await this.releaseExpiredHolds(staleHolds);
    }

    const paymentsEnabled = Boolean(
      spaceManager.stripeAccountId && spaceManager.stripeOnboardingComplete,
    );

    try {
    
      const booking = await this.prisma.booking.create({
        data: {
          bookableType,
          bookableId,
          userId,
          startTime,
          endTime,
          amountCents,
          // Stage 9 snapshots: financial history must not depend on
          // the live Desk/Room row (which may later be soft-deleted).
          spaceId,
          bookableName: bookable.name,
          ...(paymentsEnabled && {
            paymentStatus: PaymentStatus.PENDING,
            holdExpiresAt: new Date(
              Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
            ),
          }),
        },
      });

      let updatedBooking = booking;
      let clientSecret: string | null = null;



      if (paymentsEnabled) {

        try {
          const result = await this.createAndAttachPaymentIntent(
            booking.id,
            amountCents,
            spaceManager.stripeAccountId!,
          );

          updatedBooking = result.booking;
          clientSecret = result.clientSecret;
        } catch {

        
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
      // 404, not 400/403: don't confirm that someone else's booking id exists.
      throw new NotFoundException('Booking not found');
    }

    await this.resolveBookable(
      booking.bookableType,
      booking.bookableId,
      spaceId,
    );

    if (booking.cancelledAt) {
      throw new BadRequestException(
        'This booking was cancelled because the space removed it',
      );
    }

    if (booking.paymentStatus === 'PAID') {
      throw new BadRequestException('This booking is already paid');
    }

    if (booking.paymentStatus === 'PENDING') {
      // 409, same as losing the atomic claim below: "a payment is already
      // in progress" is a conflict with current state, however early or
      // late a concurrent request happens to notice it.
      throw new ConflictException(
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
      const released = await this.releaseExpiredHolds([
        {
          id: booking.id,
          stripePaymentIntentId: booking.stripePaymentIntentId,
        },
      ]);
      if (!released.has(booking.id)) {
        // Either the member's last-second payment went through, or Stripe
        // could not confirm the cancellation. Don't claim the slot is free.
        throw new ConflictException(
          'We could not confirm this payment yet — please refresh in a moment.',
        );
      }
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

    // Claim the booking atomically BEFORE talking to Stripe. The status
    // checks above are only a fast path: two simultaneous retries (double
    // click, two tabs) would both pass them and each create a PaymentIntent
    // for the same booking. This conditional update lets exactly one
    // request flip the row to PENDING; the other matches zero rows and is
    // turned away without ever reaching Stripe.
    const previous = {
      paymentStatus: booking.paymentStatus,
      holdExpiresAt: booking.holdExpiresAt,
    };

    const claim = await this.prisma.booking.updateMany({
      where: {
        id: booking.id,
        userId,
        cancelledAt: null,
        paymentStatus: booking.paymentStatus,
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        holdExpiresAt: new Date(
          Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
        ),
      },
    });

    if (claim.count === 0) {
      throw new ConflictException(
        'A payment is already in progress for this booking',
      );
    }

    try {
      const { booking: updatedBooking, clientSecret } =
        await this.createAndAttachPaymentIntent(
          booking.id,
          booking.amountCents,
          spaceManager.stripeAccountId,
        );

      return { ...updatedBooking, clientSecret };
    } catch (err) {
      // Stripe refused or failed: hand the booking back in the state it was
      // in so the member can try again, instead of leaving it PENDING with
      // no PaymentIntent behind it until the hold times out.
      await this.prisma.booking.updateMany({
        where: {
          id: booking.id,
          paymentStatus: PaymentStatus.PENDING,
          stripePaymentIntentId: booking.stripePaymentIntentId,
        },
        data: previous,
      });
      throw err;
    }
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
       
        platformFeeCents: paymentIntent.application_fee_amount ?? null,
       
        holdExpiresAt: new Date(
          Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
        ),
      },
    });

    return { booking, clientSecret: paymentIntent.client_secret };
  }
}
