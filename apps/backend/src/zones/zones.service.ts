import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    // Zone exists, but does it belong to the CALLER's space?
    // This check is what actually prevents cross-tenant reads —
    // without it, any valid zone id from any space would be readable.
    if (zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
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
