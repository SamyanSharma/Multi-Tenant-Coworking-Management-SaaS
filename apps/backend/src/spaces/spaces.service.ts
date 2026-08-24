import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  // Platform_Admin only (RBAC table: "View all spaces") — unscoped, sees everything.
  findAll() {
    return this.prisma.space.findMany();
  }

  // Space manager only (RBAC table: "View own space")
  async findOwnSpace(spaceId: string) {
  const space = await this.prisma.space.findUnique({
    where: { id: spaceId },
  });

  if (!space) {
    throw new NotFoundException('Space not found');
  }

  return space;
}

async updatePrice(spaceId: string, priceCents: number) {
  const space = await this.prisma.space.findUnique({
    where: { id: spaceId },
  });

  if (!space) {
    throw new NotFoundException('Space not found');
  }

  return this.prisma.space.update({
    where: { id: spaceId },
    data: { priceCents },
  });
}

  create(dto: CreateSpaceDto) {
    return this.prisma.space.create({ data: dto });
  }
}
