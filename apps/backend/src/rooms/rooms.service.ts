import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { LIVE } from '../common/live';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForSpace(spaceId: string) {
    return this.prisma.room.findMany({
      where: { ...LIVE, zone: { spaceId } },
    });
  }

  async findOne(id: string, spaceId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (!room || room.deletedAt || room.zone.spaceId !== spaceId) {
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

    return this.prisma.room.create({
      data: { name: dto.name, capacity: dto.capacity, zoneId: dto.zoneId },
    });
  }

  // Rename / change capacity. Existing bookings keep the name they were
  // made under (Booking.bookableName is a snapshot).
  async update(id: string, dto: UpdateRoomDto, spaceId: string) {
    await this.findOne(id, spaceId);
    return this.prisma.room.update({
      where: { id },
      data: { name: dto.name, capacity: dto.capacity },
    });
  }
}
