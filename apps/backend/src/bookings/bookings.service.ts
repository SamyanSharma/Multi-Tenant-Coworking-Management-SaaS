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

    // Validate booking time.
    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException(
        'startTime must be before endTime',
      );
    }

    // Verify that the desk/room belongs to this Space.
    await this.resolveBookable(
      bookableType,
      bookableId,
      spaceId,
    );

    // Get the booking price from the server-side Space configuration.
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { priceCents: true },
    });

    if (!space || space.priceCents === null) {
      throw new BadRequestException(
        'Booking price has not been configured for this space',
      );
    }

    // Find the Space Manager.
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

    try {
      // Create the booking first.
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

      let updatedBooking = booking;

      // ------------------------------------------------------------------
      // STRIPE PAYMENT — TEMPORARILY OPTIONAL (decision: 2026-08-24)
      // ------------------------------------------------------------------
      // Per ARCHITECTURE.md's original Payment Flow section, a booking was
      // supposed to be REJECTED with a 400 (before any DB write) if the
      // Space Manager hadn't completed Stripe Connect onboarding.
      //
      // That's blocked right now by an account-level Stripe issue, not a
      // code bug: `non_connect_platform_accounts_v2_access_blocked`
      // (Accounts v2 / Connect platform setup isn't enabled yet on the
      // platform's Stripe Dashboard — see PROGRESS.md). Enforcing the
      // hard requirement while that's blocked would make it impossible to
      // create ANY booking, so for now we skip payment entirely when the
      // manager hasn't onboarded, instead of failing the whole booking.
      //
      // This whole block is intentionally left in place (not deleted) so
      // it's a one-line flip back to strict enforcement once the Stripe
      // Dashboard config is fixed:
      //   - restore: `if (!spaceManager.stripeAccountId ||
      //     !spaceManager.stripeOnboardingComplete) { throw new
      //     BadRequestException(...) }` BEFORE the transaction above, and
      //   - keep this `if` block as unconditional (payment always runs).
      // ------------------------------------------------------------------
      if (
        spaceManager.stripeAccountId &&
        spaceManager.stripeOnboardingComplete
      ) {
        try {
          const paymentIntent =
            await this.stripeService.createBookingPaymentIntent({
              amountCents: space.priceCents,
              connectedAccountId: spaceManager.stripeAccountId,
              bookingId: booking.id,
            });

          updatedBooking = await this.prisma.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: 'PENDING',
              stripePaymentIntentId: paymentIntent.id,
            },
          });
        } catch (paymentErr) {
          await this.prisma.booking.delete({
            where: { id: booking.id },
          });

          throw new ConflictException(
            'Could not set up payment for this booking. Please try again.',
          );
        }
      }
      // else: Space Manager hasn't onboarded with Stripe yet — booking is
      // created with its default `paymentStatus` (PENDING) and no
      // PaymentIntent. Known, documented demo-scope gap; see
      // ARCHITECTURE.md's Payment Flow section and PROGRESS.md's Open
      // Questions for the orphaned-payment/no-payment tracking follow-up.

      // Notify clients in this Space.
      this.eventsGateway.emitBookingCreated(
        spaceId,
        updatedBooking,
      );

      return updatedBooking;
    } catch (err: unknown) {
      // Normal unique constraint violation.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      // PostgreSQL exclusion constraint for overlapping bookings.
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
