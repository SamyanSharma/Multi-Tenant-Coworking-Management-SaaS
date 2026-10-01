import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { LIVE } from '../common/live';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  // `activeOnly` is true for Members: an inactive zone is hidden from them
  // entirely. Managers always see every live zone (they need to reactivate).
  findAllForSpace(spaceId: string, activeOnly = false) {
    return this.prisma.zone.findMany({
      where: { spaceId, ...LIVE, ...(activeOnly && { isActive: true }) },
    });
  }

  async findOne(id: string, spaceId: string, activeOnly = false) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        desks: { where: LIVE },
        rooms: { where: LIVE },
      },
    });

    if (
      !zone ||
      zone.deletedAt ||
      zone.spaceId !== spaceId ||
      (activeOnly && !zone.isActive)
    ) {
      throw new NotFoundException('Zone not found in this space');
    }

    return zone;
  }

  create(dto: CreateZoneDto, spaceId: string) {
    return this.prisma.zone.create({
      data: {
        ...dto,
        spaceId,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateZoneDto,
    spaceId: string,
  ) {
    if (dto.name === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Nothing to update: send name and/or isActive');
    }

    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });

    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
      throw new NotFoundException('Zone not found in this space');
    }

    return this.prisma.zone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        desks: { where: LIVE },
        rooms: { where: LIVE },
      },
    });
  }
}
