import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeskDto } from './dto/create-desk.dto';

@Injectable()
export class DesksService {
  constructor(private prisma: PrismaService) {}

  findAllForSpace(spaceId: string) {
    // Filter through the relation: "desks whose zone belongs to this space"
    return this.prisma.desk.findMany({
      where: { zone: { spaceId } },
    });
  }

  async create(dto: CreateDeskDto, zoneId: string, spaceId: string) {
    // Verify the target zone actually belongs to the caller's space BEFORE creating —
    // otherwise a Space_Manager could pass any zoneId and create a desk inside
    // another tenant's zone, since Desk itself has no spaceId column to check against.
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.spaceId !== spaceId) {
      throw new ForbiddenException('Zone does not belong to this space');
    }
    return this.prisma.desk.create({
      data: { ...dto, zoneId },
    });
  }
}
