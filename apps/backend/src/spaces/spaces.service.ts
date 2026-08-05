import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  // Platform_Admin only, per the RBAC table — sees everything, unscoped.
  findAll() {
    return this.prisma.space.findMany();
  }

  // Space_Manager/Member — can only ever fetch the ONE space their token/header says they belong to.
  async findOwnSpace(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return space;
  }

  create(dto: CreateSpaceDto) {
    return this.prisma.space.create({ data: dto });
  }
}
