import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

type BookableType = 'DESK' | 'ROOM';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  // Resolves bookableId → the actual Desk or Room, and confirms it belongs to the caller's space.
  // Every booking read/write should go through this first — it's the one place the
  // "polymorphic + tenant isolation" logic lives, rather than being duplicated per method.
  private async resolveBookable(
    bookableType: BookableType,
    bookableId: string,
    spaceId: string,
  ) {
    if (bookableType === 'DESK') {
      const desk = await this.prisma.desk.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });
      if (!desk || desk.zone.spaceId !== spaceId) {
        throw new NotFoundException('Desk not found in this space');
      }
      return desk;
    }

    if (bookableType === 'ROOM') {
      const room = await this.prisma.room.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });
      if (!room || room.zone.spaceId !== spaceId) {
        throw new NotFoundException('Room not found in this space');
      }
      return room;
    }

    // TypeScript's exhaustiveness won't save us here since bookableType arrives
    // as a string from the request body, not a real union at runtime.
    throw new BadRequestException(`Unknown bookableType: ${bookableType}`);
  }
}
// apps/backend/src/bookings/bookings.service.ts (continued)
  async create(dto: CreateBookingDto, spaceId: string, userId: string) {
    const { bookableType, bookableId, startTime, endTime } = dto;

    if (new Date(startTime) >= new Date(endTime)) {
      throw new BadRequestException('startTime must be before endTime');
    }

    // Confirm the desk/room exists and belongs to this tenant BEFORE attempting the write —
    // fails fast with a clear 404 instead of a confusing DB constraint error.
    await this.resolveBookable(bookableType, bookableId, spaceId);

    try {
      // The transaction here is less about "multiple statements that must succeed together"
      // (it's really just one insert) and more about giving Prisma/Postgres a clean boundary
      // to surface the unique constraint violation as a catchable error rather than a
      // raw unhandled DB exception.
      return await this.prisma.$transaction(async (tx) => {
        return tx.booking.create({
          data: { bookableType, bookableId, userId, startTime, endTime },
        });
      });
    } catch (err: any) {
      // Prisma error code P2002 = unique constraint violation
      if (err.code === 'P2002') {
        throw new ForbiddenException(
          'This slot is already booked (exact start-time conflict)',
        );
      }
      throw err;
    }
  }
