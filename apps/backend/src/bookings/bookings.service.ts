import { BookingsGateway } from './bookings.gateway';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BookableType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

// Prisma error codes
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_CONSTRAINT_VIOLATION = 'P2004';

// Name of the PostgreSQL exclusion constraint created by the migration.
const BOOKING_OVERLAP_CONSTRAINT = 'no_overlapping_bookings';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BookingsGateway,
  ) {}

  /**
   * Resolves bookableId -> the actual Desk or Room and confirms it
   * belongs to the caller's space.
   *
   * Cross-tenant resources intentionally return NotFoundException
   * rather than ForbiddenException so that the existence of another
   * tenant's resource is not disclosed.
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
    // Booking.bookableId is polymorphic and therefore is not a real FK.
    // Resolve all Desk/Room IDs belonging to this tenant first.
    const [desks, rooms] = await Promise.all([
      this.prisma.desk.findMany({
        where: {
          zone: {
            spaceId,
          },
        },
        select: {
          id: true,
        },
      }),

      this.prisma.room.findMany({
        where: {
          zone: {
            spaceId,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    const deskIds = desks.map((desk) => desk.id);
    const roomIds = rooms.map((room) => room.id);

    return this.prisma.booking.findMany({
      where: {
        OR: [
          {
            bookableType: BookableType.DESK,
            bookableId: {
              in: deskIds,
            },
          },
          {
            bookableType: BookableType.ROOM,
            bookableId: {
              in: roomIds,
            },
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

    // Validate time range before touching the database.
    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException(
        'startTime must be before endTime',
      );
    }

    // Critical tenant-isolation check.
    // This confirms that the requested Desk/Room belongs
    // to the caller's current space.
    await this.resolveBookable(
      bookableType,
      bookableId,
      spaceId,
    );

    try {
      const booking = await this.prisma.$transaction(
        async (tx) => {
          return tx.booking.create({
            data: {
              bookableType,
              bookableId,
              userId,
              startTime,
              endTime,
            },
          });
        },
      );

      // Notify connected clients after successful creation.
      this.gateway.emitBookingCreated(
        spaceId,
        booking,
      );

      return booking;
    } catch (err: unknown) {
      /**
       * P2002
       *
       * Existing Prisma unique constraint.
       * This catches exact duplicate start-time bookings.
       */
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      /**
       * P2004
       *
       * PostgreSQL exclusion constraint.
       *
       * The migration creates:
       *
       * no_overlapping_bookings
       *
       * which prevents overlapping time ranges for the same
       * Desk/Room.
       */
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_CONSTRAINT_VIOLATION &&
        isOverlapExclusionViolation(err)
      ) {
        throw new ConflictException(
          'This resource is already booked for the selected time range.',
        );
      }

      // Preserve all unrelated database errors.
      throw err;
    }
  }
}

/**
 * Checks whether a Prisma P2004 error came from the
 * booking overlap exclusion constraint.
 *
 * Prisma's meta object can contain the database constraint
 * name depending on the Prisma/database adapter version.
 */
function isOverlapExclusionViolation(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  const meta = error.meta as
    | {
        constraint?: string;
      }
    | undefined;

  return (
    meta?.constraint === BOOKING_OVERLAP_CONSTRAINT
  );
}
