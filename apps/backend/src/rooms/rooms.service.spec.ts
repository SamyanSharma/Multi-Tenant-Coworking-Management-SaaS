import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    zone: {
      findUnique: jest.fn().mockResolvedValue(
        over.zone === undefined
          ? { id: 'zone-1', spaceId: 'space-1', deletedAt: null }
          : over.zone,
      ),
    },
    room: {
      findUnique: jest.fn().mockResolvedValue(
        over.room === undefined
          ? {
              id: 'room-1',
              name: 'Conference Room A',
              capacity: 6,
              hourlyRateCents: null,
              dailyRateCents: 4000,
              deletedAt: null,
              zone: { id: 'zone-1', spaceId: 'space-1' },
            }
          : over.room,
      ),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'room-new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'room-1', ...data })),
    },
  };
  return { service: new RoomsService(prisma), prisma };
}

describe('RoomsService.create — rate requirement', () => {
  it('rejects a room with neither hourly nor daily rate set', async () => {
    const { service } = build();

    await expect(
      service.create({ name: 'Room B', capacity: 4, zoneId: 'zone-1' } as any, 'space-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a room created with a daily-only rate (the common case for meeting rooms)', async () => {
    const { service, prisma } = build();

    const room = await service.create(
      { name: 'Room B', capacity: 4, zoneId: 'zone-1', dailyRateCents: 5000 } as any,
      'space-1',
    );

    expect(room).toMatchObject({ dailyRateCents: 5000, hourlyRateCents: null });
    expect(prisma.room.create).toHaveBeenCalledWith({
      data: { name: 'Room B', capacity: 4, zoneId: 'zone-1', hourlyRateCents: null, dailyRateCents: 5000 },
    });
  });

  it('still enforces tenant isolation on the zone before checking rates', async () => {
    const { service } = build({ zone: { id: 'zone-1', spaceId: 'OTHER-SPACE', deletedAt: null } });

    await expect(
      service.create({ name: 'Room B', capacity: 4, zoneId: 'zone-1', dailyRateCents: 5000 } as any, 'space-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('RoomsService.update — rate invariant', () => {
  it('leaves the existing rate untouched when the update omits both rate fields', async () => {
    const { service, prisma } = build();

    await service.update('room-1', { name: 'Renamed Room' } as any, 'space-1');

    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { name: 'Renamed Room', capacity: 6, hourlyRateCents: null, dailyRateCents: 4000 },
    });
  });

  it('rejects an update that would leave the room with no rate at all', async () => {
    const { service } = build({
      room: {
        id: 'room-1', name: 'Room A', capacity: 6, hourlyRateCents: null, dailyRateCents: null,
        deletedAt: null, zone: { id: 'zone-1', spaceId: 'space-1' },
      },
    });

    await expect(
      service.update('room-1', { name: 'Room A' } as any, 'space-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('RoomsService — inactive zones are hidden from Members', () => {
  const inactiveRoom = {
    id: 'room-1',
    name: 'Conference Room A',
    deletedAt: null,
    zone: { id: 'zone-1', spaceId: 'space-1', isActive: false },
  };

  it('list: a Member\'s query is restricted to active zones', async () => {
    const { service, prisma } = build();
    prisma.room.findMany = jest.fn().mockResolvedValue([]);

    await service.findAllForSpace('space-1', true);

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, zone: { spaceId: 'space-1', isActive: true } },
    });
  });

  it('get by id: 404 for a Member when the room\'s zone is inactive', async () => {
    const { service } = build({ room: inactiveRoom });

    await expect(service.findOne('room-1', 'space-1', true)).rejects.toThrow('Room not found in this space');
  });

  it('get by id: a manager can still read it', async () => {
    const { service } = build({ room: inactiveRoom });

    await expect(service.findOne('room-1', 'space-1')).resolves.toMatchObject({ id: 'room-1' });
  });
});
