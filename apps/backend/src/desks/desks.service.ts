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

    // A desk created with no rate at all is exactly how bookings ended
    // up failing with "Booking price has not been configured" — fix
    // it at the source rather than only at booking time.
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

  // Rename / re-rate. Existing bookings keep the name and price they
  // were made under (Booking.bookableName/amountCents are snapshots) —
  // changing a desk's rate here never rewrites past bookings.
  async update(id: string, dto: UpdateDeskDto, spaceId: string) {
    const existing = await this.findOne(id, spaceId);

    // "Omit both rate fields" means "leave rates as they are" (see
    // UpdateDeskDto) — but the RESULT must still have at least one
    // rate, so block a combination that would clear the only one set
    // (e.g. explicitly sending hourlyRateCents but the desk only ever
    // had a daily rate isn't possible via this DTO shape, but a future
    // "clear rate" feature must preserve this invariant).
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
