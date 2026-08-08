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

  // Space_Manager / Member — can only ever fetch the ONE space their
  // guarded request says they belong to. Space is the tenant boundary
  // itself, so this is a direct lookup by id, not a spaceId filter.
  async findOwnSpace(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return space;
  }

  create(dto: CreateSpaceDto) {
    return this.prisma.space.create({ data: dto });
  }
}
