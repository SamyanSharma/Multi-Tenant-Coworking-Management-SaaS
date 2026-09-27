import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DesksService } from './desks.service';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    zone: {
      findUnique: jest.fn().mockResolvedValue(
        over.zone === undefined
          ? { id: 'zone-1', spaceId: 'space-1', deletedAt: null }
          : over.zone,
      ),
    },
    desk: {
      findUnique: jest.fn().mockResolvedValue(
        over.desk === undefined
          ? {
              id: 'desk-1',
              name: 'Desk A1',
              hourlyRateCents: 500,
              dailyRateCents: null,
              deletedAt: null,
              zone: { id: 'zone-1', spaceId: 'space-1' },
            }
          : over.desk,
      ),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'desk-new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'desk-1', ...data })),
      findMany: jest.fn(),
    },
  };
  return { service: new DesksService(prisma), prisma };
}

describe('DesksService.create — rate requirement', () => {
  it('rejects a desk with neither hourly nor daily rate set — this was the root cause of "price not configured" booking failures', async () => {
    const { service } = build();

    await expect(
      service.create({ name: 'Desk B1', zoneId: 'zone-1' } as any, 'space-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an hourly-only rate', async () => {
    const { service, prisma } = build();

    const desk = await service.create(
      { name: 'Desk B1', zoneId: 'zone-1', hourlyRateCents: 500 } as any,
      'space-1',
    );

    expect(desk.hourlyRateCents).toBe(500);
    expect(desk.dailyRateCents).toBeNull();
    expect(prisma.desk.create).toHaveBeenCalledWith({
      data: { name: 'Desk B1', zoneId: 'zone-1', hourlyRateCents: 500, dailyRateCents: null },
    });
  });

  it('accepts a daily-only rate', async () => {
    const { service } = build();

    const desk = await service.create(
      { name: 'Desk B1', zoneId: 'zone-1', dailyRateCents: 4000 } as any,
      'space-1',
    );

    expect(desk.dailyRateCents).toBe(4000);
    expect(desk.hourlyRateCents).toBeNull();
  });

  it('accepts both rates set together', async () => {
    const { service } = build();

    const desk = await service.create(
      { name: 'Desk B1', zoneId: 'zone-1', hourlyRateCents: 500, dailyRateCents: 4000 } as any,
      'space-1',
    );

    expect(desk).toMatchObject({ hourlyRateCents: 500, dailyRateCents: 4000 });
  });

  it('still enforces tenant isolation on the zone before checking rates', async () => {
    const { service } = build({ zone: { id: 'zone-1', spaceId: 'OTHER-SPACE', deletedAt: null } });

    await expect(
      service.create({ name: 'Desk B1', zoneId: 'zone-1', hourlyRateCents: 500 } as any, 'space-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('DesksService.update — rate invariant', () => {
  it('leaves existing rates untouched when the update omits both rate fields', async () => {
    const { service, prisma } = build();

    await service.update('desk-1', { name: 'Renamed Desk' } as any, 'space-1');

    expect(prisma.desk.update).toHaveBeenCalledWith({
      where: { id: 'desk-1' },
      data: { name: 'Renamed Desk', hourlyRateCents: 500, dailyRateCents: null },
    });
  });

  it('updates just the rate that was sent, keeping the other as-is', async () => {
    const { service, prisma } = build();

    await service.update('desk-1', { name: 'Desk A1', dailyRateCents: 3000 } as any, 'space-1');

    expect(prisma.desk.update).toHaveBeenCalledWith({
      where: { id: 'desk-1' },
      data: { name: 'Desk A1', hourlyRateCents: 500, dailyRateCents: 3000 },
    });
  });

  it('rejects an update that would leave the desk with no rate at all', async () => {
    const { service } = build({
      desk: {
        id: 'desk-1', name: 'Desk A1', hourlyRateCents: 500, dailyRateCents: null,
        deletedAt: null, zone: { id: 'zone-1', spaceId: 'space-1' },
      },
    });

    // There's no "clear a rate" field in UpdateDeskDto today, but the
    // invariant check must still hold if the desk's only rate were
    // somehow already null going in (e.g. a future clear-rate feature).
    await expect(
      service.update('desk-1', { name: 'Desk A1' } as any, 'space-1'),
    ).resolves.toBeDefined(); // hourlyRateCents: 500 survives, so this one's fine

    const { service: service2 } = build({
      desk: {
        id: 'desk-1', name: 'Desk A1', hourlyRateCents: null, dailyRateCents: null,
        deletedAt: null, zone: { id: 'zone-1', spaceId: 'space-1' },
      },
    });
    await expect(
      service2.update('desk-1', { name: 'Desk A1' } as any, 'space-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
