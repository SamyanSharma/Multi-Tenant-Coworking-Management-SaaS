import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForSpace(spaceId: string) {
    return this.prisma.zone.findMany({
      where: { spaceId },
    });
  }

  async findOne(id: string, spaceId: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        desks: true,
        rooms: true,
      },
    });

    if (!zone || zone.spaceId !== spaceId) {
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

    if (!zone || zone.spaceId !== spaceId) {
      throw new NotFoundException('Zone not found in this space');
    }

    return this.prisma.zone.update({
      where: { id },
      data: {
        name: dto.name,
      },
      include: {
        desks: true,
        rooms: true,
      },
    });
  }
}
