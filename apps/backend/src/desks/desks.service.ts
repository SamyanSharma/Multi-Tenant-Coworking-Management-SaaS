import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeskDto } from './dto/create-desk.dto';
import { UpdateDeskDto } from './dto/update-desk.dto';
import { LIVE } from '../common/live';

@Injectable()
export class DesksService {
  constructor(private readonly prisma: PrismaService) {}

  // Desk has no spaceId column — filter through the relation:
  // "desks whose zone belongs to this space".
  findAllForSpace(spaceId: string) {
    return this.prisma.desk.findMany({
      where: { ...LIVE, zone: { spaceId } },
    });
  }

  async findOne(id: string, spaceId: string) {
    const desk = await this.prisma.desk.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (!desk || desk.deletedAt || desk.zone.spaceId !== spaceId) {
      // 404 rather than 403: doesn't confirm to the caller that a desk
      // with this id exists at all in a DIFFERENT tenant.
      throw new NotFoundException('Desk not found in this space');
    }
    return desk;
  }

  async create(dto: CreateDeskDto, spaceId: string) {
    
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
    }

    return this.prisma.desk.create({
      data: { name: dto.name, zoneId: dto.zoneId },
    });
  }

  // Rename. Existing bookings keep the name they were made under
  // (Booking.bookableName is a snapshot).
  async update(id: string, dto: UpdateDeskDto, spaceId: string) {
    await this.findOne(id, spaceId);
    return this.prisma.desk.update({
      where: { id },
      data: { name: dto.name },
    });
  }
}
