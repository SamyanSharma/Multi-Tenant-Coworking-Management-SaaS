import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { LIVE } from '../common/live';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForSpace(spaceId: string) {
    return this.prisma.zone.findMany({
      where: { spaceId, ...LIVE },
    });
  }

  async findOne(id: string, spaceId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        desks: { where: LIVE },
        rooms: { where: LIVE },
      },
    });

    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
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
    dto: CreateZoneDto,
    spaceId: string,
  ) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
    });

    if (!zone || zone.deletedAt || zone.spaceId !== spaceId) {
      throw new NotFoundException('Zone not found in this space');
    }

    return this.prisma.zone.update({
      where: { id },
      data: {
        name: dto.name,
      },
      include: {
        desks: { where: LIVE },
        rooms: { where: LIVE },
      },
    });
  }
}
