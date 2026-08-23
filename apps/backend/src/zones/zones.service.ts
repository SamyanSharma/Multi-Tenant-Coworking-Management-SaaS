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

    // 404 for BOTH "doesn't exist" and "exists in a different tenant" —
    // matching ARCHITECTURE.md's documented contract ("Cross-tenant lookup
    // returns 404, not 403") and the same pattern used in
    // desks.service.ts/rooms.service.ts. A caller must not be able to
    // distinguish "no such zone" from "that zone belongs to someone else."
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

    // Same 404-for-both contract as findOne above — see comment there.
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
