import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    if (zone.spaceId !== spaceId) {
      throw new ForbiddenException(
        'Zone does not belong to this space',
      );
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

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    if (zone.spaceId !== spaceId) {
      throw new ForbiddenException(
        'Zone does not belong to this space',
      );
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