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
    desk: {
      findMany: jest.fn().mockResolvedValue(
        opts.deskIds.map((id) => ({ id })),
      ),
    },
    room: {
      findMany: jest.fn().mockResolvedValue(
        opts.roomIds.map((id) => ({ id })),
      ),
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
