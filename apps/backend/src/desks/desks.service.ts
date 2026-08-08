import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeskDto } from './dto/create-desk.dto';

@Injectable()
export class DesksService {
  constructor(private readonly prisma: PrismaService) {}

  // Desk has no spaceId column — filter through the relation:
  // "desks whose zone belongs to this space".
  findAllForSpace(spaceId: string) {
    return this.prisma.desk.findMany({
      where: { zone: { spaceId } },
    });
  }

  async findOne(id: string, spaceId: string) {
    const desk = await this.prisma.desk.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (!desk || desk.zone.spaceId !== spaceId) {
      // 404 rather than 403: doesn't confirm to the caller that a desk
      // with this id exists at all in a DIFFERENT tenant.
      throw new NotFoundException('Desk not found in this space');
    }
    return desk;
  }

  async create(dto: CreateDeskDto, spaceId: string) {
    // Verify the target zone actually belongs to the caller's space BEFORE
    // creating — otherwise a Space_Manager could pass any zoneId and create
    // a desk inside another tenant's zone, since Desk itself has no
    // spaceId column to check against.
    const zone = await this.prisma.zone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone || zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
    }

    return this.prisma.desk.create({
      data: { name: dto.name, zoneId: dto.zoneId },
    });
  }
}
