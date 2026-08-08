import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForSpace(spaceId: string) {
    return this.prisma.room.findMany({
      where: { zone: { spaceId } },
    });
  }

  async findOne(id: string, spaceId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (!room || room.zone.spaceId !== spaceId) {
      throw new NotFoundException('Room not found in this space');
    }
    return room;
  }

  async create(dto: CreateRoomDto, spaceId: string) {
    // Same parent-ownership check as DesksService.create — verify the
    // target zone belongs to the caller's space before writing into it.
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone || zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
    }

    return this.prisma.room.create({
      data: { name: dto.name, capacity: dto.capacity, zoneId: dto.zoneId },
    });
  }
}
