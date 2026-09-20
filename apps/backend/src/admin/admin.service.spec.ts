import { AdminService } from './admin.service';

const NOW = new Date('2026-09-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    space: {
      findMany: jest.fn().mockResolvedValue(
        over.spaces ?? [
          { id: 's1', name: 'Alpha', slug: 'alpha', createdAt: daysAgo(100), deletedAt: null },
          { id: 's2', name: 'Beta', slug: 'beta', createdAt: daysAgo(5), deletedAt: null },
          { id: 's3', name: 'Gamma', slug: 'gamma', createdAt: daysAgo(200), deletedAt: daysAgo(10) },
        ],
      ),
    },
    user: {
      groupBy: jest.fn().mockResolvedValue(
        over.memberGroups ?? [
          { spaceId: 's1', _count: { _all: 3 } },
          { spaceId: 's2', _count: { _all: 1 } },
        ],
      ),
    },
    zone: {
      findMany: jest.fn().mockResolvedValue(
        over.zones ?? [
          { spaceId: 's1', _count: { desks: 4, rooms: 1 } },
          { spaceId: 's1', _count: { desks: 2, rooms: 0 } },
          { spaceId: 's2', _count: { desks: 1, rooms: 2 } },
        ],
      ),
    },
    booking: {
      findMany: jest.fn(),
      // call order in AdminService: byStatus, paidByStatusAgg, paidBySpace, paidBySpace30
      groupBy: jest
        .fn()
        .mockResolvedValueOnce(
          over.byStatus ?? [
            { paymentStatus: 'PAID', _count: { _all: 5 } },
            { paymentStatus: 'REFUNDED', _count: { _all: 1 } },
            { paymentStatus: 'UNPAID', _count: { _all: 2 } },
          ],
        )
        .mockResolvedValueOnce(
          over.moneyByStatus ?? [
            { paymentStatus: 'PAID', _sum: { amountCents: 10000, platformFeeCents: 500, refundedAmountCents: null } },
            { paymentStatus: 'REFUNDED', _sum: { amountCents: 2500, platformFeeCents: 125, refundedAmountCents: 2500 } },
            { paymentStatus: 'REFUND_PENDING', _sum: { amountCents: 1000, platformFeeCents: 50, refundedAmountCents: null } },
            { paymentStatus: 'REFUND_FAILED', _sum: { amountCents: 500, platformFeeCents: 25, refundedAmountCents: null } },
          ],
        )
        .mockResolvedValueOnce(
          over.paidBySpace ?? [
            { spaceId: 's1', _sum: { amountCents: 7500 } },
            { spaceId: 's2', _sum: { amountCents: 2500 } },
          ],
        )
        .mockResolvedValueOnce(
          over.paidBySpace30 ?? [
            { spaceId: 's2', _sum: { amountCents: 2500 }, _count: { _all: 1 } },
            { spaceId: 's1', _sum: { amountCents: 5000 }, _count: { _all: 2 } },
          ],
        ),
      aggregate: jest
        .fn()
        .mockResolvedValueOnce(
          over.last30 ?? { _sum: { amountCents: 7500, platformFeeCents: 375 }, _count: { _all: 3 } },
        )
        .mockResolvedValueOnce(over.prev30 ?? { _sum: { amountCents: 5000 } }),
    },
  };
  return { service: new AdminService(prisma), prisma };
}

describe('AdminService.overview', () => {
  it('counts active vs closed spaces and spaces created in the last 30 days', async () => {
    const { service } = build();
    const o = await service.overview(NOW);
    expect(o.spaces).toEqual({ active: 2, closed: 1, createdLast30d: 1 });
  });

  it('members = MEMBER users attached to LIVE spaces only (filter is in the query)', async () => {
    const { service, prisma } = build();
    const o = await service.overview(NOW);
    expect(o.members.total).toBe(4);
    expect(prisma.user.groupBy.mock.calls[0][0].where).toEqual({
      role: 'MEMBER',
      space: { is: { deletedAt: null } },
    });
  });

  it('net revenue = PAID only; refunded money is not revenue; collected = net + refunded + pending', async () => {
    const { service } = build();
    const { revenue } = await service.overview(NOW);
    expect(revenue.netCents).toBe(10000);
    expect(revenue.platformFeeNetCents).toBe(500);
    expect(revenue.refundedCents).toBe(2500);
    expect(revenue.pendingRefundCents).toBe(1500); // REFUND_PENDING 1000 + REFUND_FAILED 500
    expect(revenue.collectedCents).toBe(10000 + 2500 + 1500);
  });

  it('trailing-30-day figures and the change vs the previous 30 days', async () => {
    const { service, prisma } = build();
    const { revenue } = await service.overview(NOW);
    expect(revenue.last30d).toEqual({ netCents: 7500, platformFeeNetCents: 375, bookings: 3 });
    expect(revenue.prev30d).toEqual({ netCents: 5000 });
    expect(revenue.changePct).toBe(50);
    const [cur, prev] = prisma.booking.aggregate.mock.calls.map((c: any[]) => c[0].where);
    expect(cur.paymentStatus).toBe('PAID');
    expect(cur.paidAt.gte.getTime()).toBe(daysAgo(30).getTime());
    expect(prev.paidAt.gte.getTime()).toBe(daysAgo(60).getTime());
    expect(prev.paidAt.lt.getTime()).toBe(daysAgo(30).getTime());
  });

  it('changePct is null (not Infinity/NaN) when there was no revenue in the previous period', async () => {
    const { service } = build({ prev30: { _sum: { amountCents: null } } });
    const { revenue } = await service.overview(NOW);
    expect(revenue.prev30d.netCents).toBe(0);
    expect(revenue.changePct).toBeNull();
  });

  it('empty platform: zeros everywhere, no crash', async () => {
    const { service } = build({
      spaces: [],
      memberGroups: [],
      zones: [],
      byStatus: [],
      moneyByStatus: [],
      paidBySpace: [],
      paidBySpace30: [],
      last30: { _sum: { amountCents: null, platformFeeCents: null }, _count: { _all: 0 } },
      prev30: { _sum: { amountCents: null } },
    });
    const o = await service.overview(NOW);
    expect(o.spaces).toEqual({ active: 0, closed: 0, createdLast30d: 0 });
    expect(o.revenue.netCents).toBe(0);
    expect(o.revenue.collectedCents).toBe(0);
    expect(o.perSpace).toEqual([]);
    expect(o.payments.byStatus).toEqual({});
  });

  it('per-space rows: live desk/room totals, revenue, status; active first then by 30d revenue', async () => {
    const { service } = build();
    const { perSpace } = await service.overview(NOW);
    expect(perSpace.map((r) => r.id)).toEqual(['s1', 's2', 's3']);
    expect(perSpace[0]).toMatchObject({
      id: 's1', status: 'ACTIVE', members: 3, desks: 6, rooms: 1,
      netCents: 7500, netCents30d: 5000, bookings30d: 2,
    });
    expect(perSpace[1]).toMatchObject({ id: 's2', members: 1, desks: 1, rooms: 2, netCents30d: 2500 });
    expect(perSpace[2]).toMatchObject({ id: 's3', status: 'CLOSED', members: 0, netCents: 0 });
  });

  it('aggregates in the database — never fetches booking rows to sum in JS', async () => {
    const { service, prisma } = build();
    await service.overview(NOW);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.groupBy).toHaveBeenCalled();
    expect(prisma.booking.aggregate).toHaveBeenCalled();
  });
});
