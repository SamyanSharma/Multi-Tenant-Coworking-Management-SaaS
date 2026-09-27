import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('rejects a Member who has already joined a space — no switching in this version', async () => {
    const { service, prisma } = build({ joiningUser: { id: 'user-1', role: 'MEMBER', spaceId: 'already-joined' } });

    await expect(service.join('user-1', 's1')).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects joining a space that does not exist or has been closed (the LIVE filter excludes it)', async () => {
    const { service, prisma } = build({ joinTargetSpace: null });

    await expect(service.join('user-1', 'closed-space')).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
