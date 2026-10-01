import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeskDto } from './dto/create-desk.dto';
import { UpdateDeskDto } from './dto/update-desk.dto';
import { LIVE } from '../common/live';

@Injectable()
export class DesksService {
  constructor(private readonly prisma: PrismaService) {}
 are hidden.
  findAllForSpace(spaceId: string, activeOnly = false) {
    return this.prisma.desk.findMany({
      where: {
        ...LIVE,
        zone: { spaceId, ...(activeOnly && { isActive: true }) },
      },
    });
  }

  async findOne(id: string, spaceId: string, activeOnly = false) {
    const desk = await this.prisma.desk.findUnique({
      where: { id },
      include: { zone: true },
    });
    if (
      !desk ||
      desk.deletedAt ||
      desk.zone.spaceId !== spaceId ||
      (activeOnly && !desk.zone.isActive)
    ) {
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

    
    if (dto.hourlyRateCents == null && dto.dailyRateCents == null) {
      throw new BadRequestException(
        'Set an hourly rate, a daily rate, or both, for this desk',
      );
    }

    return this.prisma.desk.create({
      data: {
        name: dto.name,
        zoneId: dto.zoneId,
        hourlyRateCents: dto.hourlyRateCents ?? null,
        dailyRateCents: dto.dailyRateCents ?? null,
      },
    });
  }

 
  async update(id: string, dto: UpdateDeskDto, spaceId: string) {
    const existing = await this.findOne(id, spaceId);

    
    const nextHourly = dto.hourlyRateCents ?? existing.hourlyRateCents;
    const nextDaily = dto.dailyRateCents ?? existing.dailyRateCents;
    if (nextHourly == null && nextDaily == null) {
      throw new BadRequestException(
        'This desk must keep at least one rate (hourly or daily)',
      );
    }

    return this.prisma.desk.update({
      where: { id },
      data: {
        name: dto.name,
        hourlyRateCents: nextHourly,
        dailyRateCents: nextDaily,
      },
    });
  }
}
