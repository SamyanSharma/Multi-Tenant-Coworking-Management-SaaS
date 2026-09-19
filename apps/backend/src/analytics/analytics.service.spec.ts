import { AnalyticsService } from './analytics.service';

// Mocks respond based on the shape of the `where` clause passed in,
// rather than call order — call order is an implementation detail
// (Promise.all array position) that shouldn't be part of what the
// test locks in.
function buildPrismaMock(opts: {
  deskIds: string[];
  roomIds: string[];
  totalBookings: number;
  paidAmounts: number[]; // all-time PAID bookings
  activeBookings: number;
  currentPeriodCount: number;
  previousPeriodCount: number;
  currentPeriodPaidAmounts: number[];
  previousPeriodPaidAmounts: number[];
}) {
  return {
    // Stage 9: utilization's denominator only needs COUNTS of live
    // desks/rooms; bookings are scoped by Booking.spaceId, not by ids.
    desk: {
      count: jest.fn().mockResolvedValue(opts.deskIds.length),
    },
    room: {
      count: jest.fn().mockResolvedValue(opts.roomIds.length),
    },
    booking: {
      count: jest.fn((args: any) => {
        const where = args.where;
        if (where.startTime) {
          return Promise.resolve(opts.activeBookings);
        }
        if (where.createdAt?.lt) {
          return Promise.resolve(opts.previousPeriodCount);
        }
        if (where.createdAt) {
          return Promise.resolve(opts.currentPeriodCount);
        }
        return Promise.resolve(opts.totalBookings);
      }),
      findMany: jest.fn((args: any) => {
        const where = args.where;
        const toRows = (amounts: number[]) =>
          Promise.resolve(amounts.map((amountCents) => ({ amountCents })));

        if (where.createdAt?.lt) {
          return toRows(opts.previousPeriodPaidAmounts);
        }
        if (where.createdAt) {
          return toRows(opts.currentPeriodPaidAmounts);
        }
        return toRows(opts.paidAmounts);
      }),
    },
  };
}

describe('AnalyticsService.spaceSummary', () => {
  function makeService(opts: Parameters<typeof buildPrismaMock>[0]) {
    const prisma = buildPrismaMock(opts);
    return new AnalyticsService(prisma as any);
  }

  it('computes totalRevenue, activeBookings, totalBookings, utilizationRate as before', async () => {
    const service = makeService({
      deskIds: ['d1', 'd2'],
      roomIds: ['r1'],
      totalBookings: 3,
      paidAmounts: [1000, 2000],
      activeBookings: 1,
      currentPeriodCount: 3,
      previousPeriodCount: 3,
      currentPeriodPaidAmounts: [1000, 2000],
      previousPeriodPaidAmounts: [1000, 2000],
    });

    const result = await service.spaceSummary('space-1');

    expect(result.totalRevenue).toBe(3000);
    expect(result.activeBookings).toBe(1);
    expect(result.totalBookings).toBe(3);
    // 1 active out of 3 total resources
    expect(result.utilizationRate).toBeCloseTo(1 / 3);
  });

  it('returns 0% utilization (not NaN) when the space has no desks/rooms at all', async () => {
    const service = makeService({
      deskIds: [],
      roomIds: [],
      totalBookings: 0,
      paidAmounts: [],
      activeBookings: 0,
      currentPeriodCount: 0,
      previousPeriodCount: 0,
      currentPeriodPaidAmounts: [],
      previousPeriodPaidAmounts: [],
    });

    const result = await service.spaceSummary('space-1');
    expect(result.utilizationRate).toBe(0);
  });

  it('computes a real positive revenueChangePct when both periods have revenue', async () => {
    const service = makeService({
      deskIds: ['d1'],
      roomIds: [],
      totalBookings: 4,
      paidAmounts: [1000],
      activeBookings: 0,
      currentPeriodCount: 2,
      previousPeriodCount: 2,
      currentPeriodPaidAmounts: [1500], // $15 this period
      previousPeriodPaidAmounts: [1000], // $10 last period -> +50%
    });

    const result = await service.spaceSummary('space-1');
    expect(result.revenueChangePct).toBeCloseTo(50);
  });

  it('returns null (not Infinity/NaN) when previous period had zero revenue but current period has some', async () => {
    const service = makeService({
      deskIds: ['d1'],
      roomIds: [],
      totalBookings: 1,
      paidAmounts: [1000],
      activeBookings: 0,
      currentPeriodCount: 1,
      previousPeriodCount: 0,
      currentPeriodPaidAmounts: [1000],
      previousPeriodPaidAmounts: [],
    });

    const result = await service.spaceSummary('space-1');
    expect(result.revenueChangePct).toBeNull();
  });

  it('returns 0 (not null) when both periods have zero revenue/bookings', async () => {
    const service = makeService({
      deskIds: ['d1'],
      roomIds: [],
      totalBookings: 0,
      paidAmounts: [],
      activeBookings: 0,
      currentPeriodCount: 0,
      previousPeriodCount: 0,
      currentPeriodPaidAmounts: [],
      previousPeriodPaidAmounts: [],
    });

    const result = await service.spaceSummary('space-1');
    expect(result.revenueChangePct).toBe(0);
    expect(result.totalBookingsChangePct).toBe(0);
  });

  it('computes a real negative totalBookingsChangePct when bookings dropped', async () => {
    const service = makeService({
      deskIds: ['d1'],
      roomIds: [],
      totalBookings: 6,
      paidAmounts: [],
      activeBookings: 0,
      currentPeriodCount: 1,
      previousPeriodCount: 4, // dropped from 4 to 1 -> -75%
      currentPeriodPaidAmounts: [],
      previousPeriodPaidAmounts: [],
    });

    const result = await service.spaceSummary('space-1');
    expect(result.totalBookingsChangePct).toBeCloseTo(-75);
  });
});

// Stage 9.1a: revenue/booking history must not depend on live desk/room rows.
describe('AnalyticsService.spaceSummary — scoping (Stage 9)', () => {
  it('scopes every booking query by Booking.spaceId and excludes cancelled bookings', async () => {
    const prisma = buildPrismaMock({
      deskIds: ['d1'],
      roomIds: [],
      totalBookings: 1,
      paidAmounts: [1000],
      activeBookings: 0,
      currentPeriodCount: 1,
      previousPeriodCount: 0,
      currentPeriodPaidAmounts: [1000],
      previousPeriodPaidAmounts: [],
    });
    const service = new AnalyticsService(prisma as any);

    await service.spaceSummary('space-1');

    const wheres = [
      ...prisma.booking.count.mock.calls.map((c: any[]) => c[0].where),
      ...prisma.booking.findMany.mock.calls.map((c: any[]) => c[0].where),
    ];
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where.spaceId).toBe('space-1');
      expect(where.cancelledAt).toBeNull();
      // No join through desk/room ids anymore.
      expect(where.OR).toBeUndefined();
    }
  });

  it('counts desks and rooms for utilization by live rows in the space', async () => {
    const prisma = buildPrismaMock({
      deskIds: ['d1', 'd2'],
      roomIds: ['r1'],
      totalBookings: 0,
      paidAmounts: [],
      activeBookings: 0,
      currentPeriodCount: 0,
      previousPeriodCount: 0,
      currentPeriodPaidAmounts: [],
      previousPeriodPaidAmounts: [],
    });
    const service = new AnalyticsService(prisma as any);

    await service.spaceSummary('space-9');

    expect(prisma.desk.count).toHaveBeenCalledWith({
      where: { zone: { spaceId: 'space-9' } },
    });
    expect(prisma.room.count).toHaveBeenCalledWith({
      where: { zone: { spaceId: 'space-9' } },
    });
  });
});
