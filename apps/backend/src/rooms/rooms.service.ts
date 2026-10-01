import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { LIVE } from '../common/live';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  // `activeOnly` is true for Members: rooms in an inactive zone are hidden.
  findAllForSpace(spaceId: string, activeOnly = false) {
    return this.prisma.room.findMany({
      where: {
        ...LIVE,
        zone: { spaceId, ...(activeOnly && { isActive: true }) },
      },
    });
  }

  async findOne(id: string, spaceId: string, activeOnly = false) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (
      !room ||
      room.deletedAt ||
      room.zone.spaceId !== spaceId ||
      (activeOnly && !room.zone.isActive)
    ) {
      throw new NotFoundException('Room not found in this space');
    }
    return room;
  }

  async create(dto: CreateRoomDto, spaceId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
    }

    // See DesksService.create's comment — same reasoning: a room
    // created with no rate is exactly how bookings ended up failing
    // with "Booking price has not been configured".
    if (dto.hourlyRateCents == null && dto.dailyRateCents == null) {
      throw new BadRequestException(
        'Set an hourly rate, a daily rate, or both, for this room',
      );
    }

    return this.prisma.room.create({
      data: {
        name: dto.name,
        capacity: dto.capacity,
        zoneId: dto.zoneId,
        hourlyRateCents: dto.hourlyRateCents ?? null,
        dailyRateCents: dto.dailyRateCents ?? null,
      },
    });
  }

  // Rename / change capacity / re-rate. Existing bookings keep the
  // name and price they were made under (Booking.bookableName/
  // amountCents are snapshots) — changing a room's rate here never
  // rewrites past bookings.
  async update(id: string, dto: UpdateRoomDto, spaceId: string) {
    const existing = await this.findOne(id, spaceId);

    // "Omit both rate fields" means "leave rates as they are" (see
    // UpdateRoomDto) — but the result must still keep at least one.
    const nextHourly = dto.hourlyRateCents ?? existing.hourlyRateCents;
    const nextDaily = dto.dailyRateCents ?? existing.dailyRateCents;
    if (nextHourly == null && nextDaily == null) {
      throw new BadRequestException(
        'This room must keep at least one rate (hourly or daily)',
      );
    }

    return this.prisma.room.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        capacity: dto.capacity ?? existing.capacity,
        hourlyRateCents: nextHourly,
        dailyRateCents: nextDaily,
      },
    });
  }
}
