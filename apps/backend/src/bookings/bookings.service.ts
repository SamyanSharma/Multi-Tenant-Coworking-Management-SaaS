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

  /// Resolves a bookable (Desk or Room) and confirms it belongs to the given spaceId.
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
      // Create the Booking row in the database, then create the Stripe
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

      // Create a Stripe PaymentIntent for the booking, which will be confirmed
      let updatedBooking;
      try {
        const paymentIntent =
          await this.stripeService.createBookingPaymentIntent({
            amountCents: space.priceCents,
            connectedAccountId: spaceManager.stripeAccountId,
            bookingId: booking.id,
          });

        // Update the booking with the Stripe PaymentIntent 
        updatedBooking = await this.prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'PENDING',
            stripePaymentIntentId: paymentIntent.id,
          },
        });
      } catch (paymentErr) {
        
        await this.prisma.booking.delete({ where: { id: booking.id } });

        throw new ConflictException(
          'Could not set up payment for this booking. Please try again.',
        );
      }

      this.eventsGateway.emitBookingCreated(
        spaceId,
        updatedBooking,
      );

      return updatedBooking;
    } catch (err: unknown) {
      // Handle known Prisma errors for unique constraint violations
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      // Handle known Prisma errors for exclusion constraint violations (overlapping bookings)
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
