import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { LIVE } from '../common/live';

export interface PublicSpace {
  id: string;
  name: string;
  priceCents: number | null;
  members: number;
  desks: number;
  rooms: number;
}

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.space.findMany();
  }

  // Unauthenticated directory for the signup page's "browse spaces"
  // flow. Deliberately narrow: no slug (that's still the private join
  // code), no Stripe/manager fields — just enough for a prospective
  // Member to pick a space (name, indicative price, and rough size).
  // Counts reuse the same _count/groupBy aggregate pattern as
  // AdminService.overview() — never fetch-and-sum in JS.
  async findPublic(): Promise<PublicSpace[]> {
    const [spaces, memberGroups, zoneCounts] = await Promise.all([
      this.prisma.space.findMany({
        where: LIVE,
        select: { id: true, name: true, priceCents: true, createdAt: true },
      }),
      this.prisma.user.groupBy({
        by: ['spaceId'],
        where: { role: 'MEMBER', space: { is: LIVE } },
        _count: { _all: true },
      }),
      this.prisma.zone.findMany({
        where: LIVE,
        select: {
          spaceId: true,
          _count: { select: { desks: { where: LIVE }, rooms: { where: LIVE } } },
        },
      }),
    ]);

    const membersBySpace = new Map<string, number>();
    for (const g of memberGroups) {
      if (g.spaceId) membersBySpace.set(g.spaceId, g._count._all);
    }
    const desksBySpace = new Map<string, number>();
    const roomsBySpace = new Map<string, number>();
    for (const z of zoneCounts) {
      desksBySpace.set(z.spaceId, (desksBySpace.get(z.spaceId) ?? 0) + z._count.desks);
      roomsBySpace.set(z.spaceId, (roomsBySpace.get(z.spaceId) ?? 0) + z._count.rooms);
    }

    return spaces
      .map((s) => ({
        id: s.id,
        name: s.name,
        priceCents: s.priceCents,
        members: membersBySpace.get(s.id) ?? 0,
        desks: desksBySpace.get(s.id) ?? 0,
        rooms: roomsBySpace.get(s.id) ?? 0,
        createdAt: s.createdAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ createdAt: _createdAt, ...rest }) => rest);
  }

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
