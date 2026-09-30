import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SpacesService } from './spaces.service';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    space: {
      findUnique: jest.fn().mockResolvedValue(
        over.ownSpace === undefined ? { id: 's1', name: 'Alpha', slug: 'alpha' } : over.ownSpace,
      ),
      findMany: jest.fn().mockResolvedValue(
        over.spaces ?? [
          { id: 's1', name: 'Alpha', priceCents: 1500, createdAt: new Date('2026-09-01') },
          { id: 's2', name: 'Beta', priceCents: null, createdAt: new Date('2026-09-10') },
        ],
      ),
      findFirst: jest.fn().mockResolvedValue(
        over.joinTargetSpace === undefined
          ? { id: 's1', name: 'Alpha', slug: 'alpha', deletedAt: null }
          : over.joinTargetSpace,
      ),
    },
    user: {
      groupBy: jest.fn().mockResolvedValue(
        over.memberGroups ?? [{ spaceId: 's1', _count: { _all: 4 } }],
      ),
      findUnique: jest.fn().mockResolvedValue(
        over.joiningUser === undefined
          ? { id: 'user-1', role: 'MEMBER', spaceId: null }
          : over.joiningUser,
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'user-1', role: 'MEMBER', ...data }),
      ),
    },
    desk: { count: jest.fn().mockResolvedValue(over.deskCount ?? 1) },
    room: {
      aggregate: jest.fn().mockResolvedValue(
        over.roomAgg ?? { _count: { _all: 1 }, _sum: { capacity: 4 } },
      ),
    },
    zone: {
      findMany: jest.fn().mockResolvedValue(
        over.zones ?? [
          { spaceId: 's1', _count: { desks: 3, rooms: 1 } },
          { spaceId: 's2', _count: { desks: 0, rooms: 0 } },
        ],
      ),
    },
  };
  const authService: any = {
    buildAuthResult: jest.fn((user) => ({
      accessToken: 'fresh-token',
      user: { id: user.id, role: user.role, spaceId: user.spaceId },
    })),
  };
  return { service: new SpacesService(prisma, authService), prisma, authService };
}

describe('SpacesService.findPublic', () => {
  it('only queries live spaces/zones (the LIVE filter), never fetches deleted rows', async () => {
    const { service, prisma } = build();

    await service.findPublic();

    expect(prisma.space.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
    expect(prisma.zone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('never selects slug, stripe or user-identifying fields — this endpoint is unauthenticated', async () => {
    const { service, prisma } = build();

    await service.findPublic();

    const selectArg = prisma.space.findMany.mock.calls[0][0].select;
    expect(selectArg).toEqual({ id: true, name: true, priceCents: true, createdAt: true });
  });

  it('attaches member/desk/room counts to the right space and sorts newest first', async () => {
    const { service } = build();

    const result = await service.findPublic();

    expect(result).toEqual([
      { id: 's2', name: 'Beta', priceCents: null, members: 0, desks: 0, rooms: 0 },
      { id: 's1', name: 'Alpha', priceCents: 1500, members: 4, desks: 3, rooms: 1 },
    ]);
  });

  it('defaults counts to 0 for a space with no members/zones yet, rather than throwing', async () => {
    const { service } = build({
      spaces: [{ id: 's3', name: 'Empty', priceCents: 500, createdAt: new Date() }],
      memberGroups: [],
      zones: [],
    });

    const result = await service.findPublic();

    expect(result).toEqual([
      { id: 's3', name: 'Empty', priceCents: 500, members: 0, desks: 0, rooms: 0 },
    ]);
  });
});

describe('SpacesService.join', () => {
  it('assigns spaceId and returns a fresh accessToken — the old token still carries spaceId: null', async () => {
    const { service, prisma, authService } = build();

    const result = await service.join('user-1', 's1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { spaceId: 's1' },
    });
    expect(authService.buildAuthResult).toHaveBeenCalled();
    expect(result.accessToken).toBe('fresh-token');
  });

  it('rejects a caller who is not a MEMBER (belt-and-suspenders alongside the route\'s own @Roles guard)', async () => {
    const { service } = build({ joiningUser: { id: 'user-1', role: 'SPACE_MANAGER', spaceId: 'space-x' } });

    await expect(service.join('user-1', 's1')).rejects.toThrow(ForbiddenException);
  });

  it('lets a Member who is already in a space switch to another live space', async () => {
    const { service, prisma, authService } = build({ joiningUser: { id: 'user-1', role: 'MEMBER', spaceId: 'already-joined' } });

    const result = await service.join('user-1', 's1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { spaceId: 's1' },
    });
    expect(authService.buildAuthResult).toHaveBeenCalled();
    expect(result.accessToken).toBe('fresh-token');
  });

  it('re-selecting the current space reissues a token without a write', async () => {
    const { service, prisma } = build({ joiningUser: { id: 'user-1', role: 'MEMBER', spaceId: 's1' } });

    const result = await service.join('user-1', 's1');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result.accessToken).toBe('fresh-token');
  });

  it('rejects joining a space that does not exist or has been closed (the LIVE filter excludes it)', async () => {
    const { service, prisma } = build({ joinTargetSpace: null });

    await expect(service.join('user-1', 'closed-space')).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('SpacesService.findOwnSpace counts', () => {
  it('reports desks, rooms and capacity = desks + room capacity (1 desk + a 4-seat room = 5)', async () => {
    const { service } = build();

    const result: any = await service.findOwnSpace('s1');

    expect(result.id).toBe('s1');
    expect(result.counts).toEqual({ desks: 1, rooms: 1, capacity: 5 });
  });

  it('scopes both queries to this space through the zone and to live rows only', async () => {
    const { service, prisma } = build();

    await service.findOwnSpace('s1');

    const where = { deletedAt: null, zone: { spaceId: 's1' } };
    expect(prisma.desk.count).toHaveBeenCalledWith({ where });
    expect(prisma.room.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('is all zeros for a space with no desks or rooms (null room sum)', async () => {
    const { service } = build({
      deskCount: 0,
      roomAgg: { _count: { _all: 0 }, _sum: { capacity: null } },
    });

    const result: any = await service.findOwnSpace('s1');

    expect(result.counts).toEqual({ desks: 0, rooms: 0, capacity: 0 });
  });

  it('throws NotFound (and runs no count queries) for an unknown space', async () => {
    const { service, prisma } = build({ ownSpace: null });

    await expect(service.findOwnSpace('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.desk.count).not.toHaveBeenCalled();
  });
});
