import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { LIVE } from '../common/live';
import { computeCapacity } from '../common/capacity';
import { AuthService } from '../auth/auth.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  findAll() {
    return this.prisma.space.findMany();
  }

 
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
        where: { ...LIVE, isActive: true },
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

  // `activeOnly` is true for Members: totals then cover only zones they can
  // actually see and book. Managers see the full inventory.
  async findOwnSpace(spaceId: string, activeOnly = false) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    // Desks/rooms have no spaceId of their own; they belong to a space
    // through their zone. LIVE on the row itself is enough because deleting
    // a parent soft-deletes its whole subtree (see common/live.ts).
    const inThisSpace = {
      ...LIVE,
      zone: { spaceId, ...(activeOnly && { isActive: true }) },
    };
    const [desks, roomAgg] = await Promise.all([
      this.prisma.desk.count({ where: inThisSpace }),
      this.prisma.room.aggregate({
        where: inThisSpace,
        _count: { _all: true },
        _sum: { capacity: true },
      }),
    ]);

    return {
      ...space,
      counts: {
        desks,
        rooms: roomAgg._count._all,
        capacity: computeCapacity(desks, roomAgg._sum.capacity ?? 0),
      },
    };
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

  // "Browse all spaces" -> Join. Replaces the old signup-time
  // slug/id lookup: a MEMBER now always signs up with no space, then
  // calls this once they've picked one from GET /spaces/public. Since
  // the JWT carries spaceId, joining must reissue a token — that's why
  // this returns a full auth result (accessToken + user), the same
  // shape as login/signup, not just the updated user row.
  async join(userId: string, spaceId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.role !== 'MEMBER') {
      // Route is @Roles(MEMBER)-gated already; this only fires if the
      // user row itself is somehow inconsistent with their own JWT.
      throw new ForbiddenException('Only a Member account can join a space');
    }

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...LIVE },
    });

    if (!space) {
      throw new NotFoundException(
        'That space is no longer available — pick another from the list',
      );
    }

    // Members may switch spaces freely: user.spaceId is their *active*
    // space, and switching just repoints it and reissues the JWT. Old
    // bookings keep their own Booking.spaceId, so history is preserved.
    // Re-selecting the current space is a no-op write, not an error.
    const updated =
      user.spaceId === space.id
        ? user
        : await this.prisma.user.update({
            where: { id: userId },
            data: { spaceId: space.id },
          });

    return this.authService.buildAuthResult(updated);
  }
}
