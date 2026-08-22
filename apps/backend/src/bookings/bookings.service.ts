import { BookingsGateway } from './bookings.gateway';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { BookableType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

// Prisma's unique-constraint-violation error code.
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class BookingsService {
  // AFTER
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BookingsGateway,
  ) {}
  /**
   * Resolves bookableId -> the actual Desk or Room, and confirms it
   * belongs to the caller's space. bookableId is NOT a real Prisma
   * relation (per ARCHITECTURE.md's polymorphic Booking design), so this
   * is the one place the "polymorphic + tenant isolation" logic lives,
   * rather than duplicating it per method.
   *
   * Returns NotFoundException (not Forbidden) for cross-tenant ids — this
   * avoids confirming to a caller that a given id exists at all in a
   * different tenant.
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

    // Belt-and-suspenders: class-validator's @IsEnum already rejects
    // anything outside BookableType before this method is reached, but
    // bookableType still arrives as a plain string at runtime, so this
    // isn't provably unreachable to the type checker.
    throw new BadRequestException(`Unknown bookableType: ${bookableType}`);
  }

  async findAllForSpace(spaceId: string) {
    // Booking.bookableId is not a real FK (per ARCHITECTURE.md), so there's
    // no single relation filter for "bookings in my space" — this is the
    // direct cost of the polymorphic design. Resolve which Desk/Room ids
    // belong to this space first, then filter Bookings against those id
    // lists, branching on bookableType.
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
          { bookableType: BookableType.DESK, bookableId: { in: deskIds } },
          { bookableType: BookableType.ROOM, bookableId: { in: roomIds } },
        ],
      },
    });
  }

  async create(dto: CreateBookingDto, spaceId: string, userId: string) {
    const { bookableType, bookableId, startTime, endTime } = dto;

    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException('startTime must be before endTime');
    }

    await this.resolveBookable(bookableType, bookableId, spaceId);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        return tx.booking.create({
          data: { bookableType, bookableId, userId, startTime, endTime },
        });
      });

      this.gateway.emitBookingCreated(spaceId, booking);

      return booking;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ForbiddenException(
          'This slot is already booked (exact start-time conflict). ' +
            'NOTE: the current unique constraint only catches EXACT ' +
            'start-time collisions, not partial time-range overlaps — ' +
            'see ARCHITECTURE.md Concurrency Strategy and the exclusion- ' +
            'constraint migration for the stronger version.',
        );
      }
      throw err;
    }
  }
