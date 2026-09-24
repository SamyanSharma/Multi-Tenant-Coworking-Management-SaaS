import { SpacesService } from './spaces.service';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    space: {
      findMany: jest.fn().mockResolvedValue(
        over.spaces ?? [
          { id: 's1', name: 'Alpha', priceCents: 1500, createdAt: new Date('2026-09-01') },
          { id: 's2', name: 'Beta', priceCents: null, createdAt: new Date('2026-09-10') },
        ],
      ),
    },
    user: {
      groupBy: jest.fn().mockResolvedValue(
        over.memberGroups ?? [{ spaceId: 's1', _count: { _all: 4 } }],
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
  return { service: new SpacesService(prisma), prisma };
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
