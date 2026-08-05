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
