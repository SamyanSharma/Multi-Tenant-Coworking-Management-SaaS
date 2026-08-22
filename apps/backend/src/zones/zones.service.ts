import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';

@Injectable()
export class ZonesService {
  constructor(private prisma: PrismaService) {}

  // Zone has spaceId directly on it (per ARCHITECTURE.md) — straightforward filter.
  findAllForSpace(spaceId: string) {
    return this.prisma.zone.findMany({ where: { spaceId } });
  }

  async findOne(id: string, spaceId: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
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
    // spaceId comes from the request (TenantGuard), NOT from the request body —
    // never trust a client-supplied spaceId in the payload, or a Space_Manager
    // could create a zone inside a DIFFERENT space by just changing the JSON.
    return this.prisma.zone.create({
      data: { ...dto, spaceId },
    });
  }
}
