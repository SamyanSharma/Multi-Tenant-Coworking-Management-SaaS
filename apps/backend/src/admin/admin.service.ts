import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LIVE } from '../common/live';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: Date;
  members: number;
  desks: number;
  rooms: number;
  netCents: number;
  netCents30d: number;
  bookings30d: number;
}

export interface AdminOverview {
  generatedAt: string;
  spaces: { active: number; closed: number; createdLast30d: number };
  members: { total: number };
  payments: { byStatus: Record<string, number> };
  revenue: {
    collectedCents: number;
    refundedCents: number;
    pendingRefundCents: number;
    netCents: number;
    platformFeeNetCents: number;
    last30d: { netCents: number; platformFeeNetCents: number; bookings: number };
    prev30d: { netCents: number };
    changePct: number | null;
  };
  perSpace: SpaceRow[];
}

/**
 * Platform-wide numbers for the Platform Admin dashboard.
 *
 * Definitions (part of the product contract — see ARCHITECTURE.md §9.9):
 *  - active space   : deletedAt IS NULL
 *  - members        : MEMBER users attached to a live space
 *  - net revenue    : SUM(amountCents) of bookings that are PAID right now
 *                     (refunded money is NOT revenue)
 *  - refunded       : SUM(refundedAmountCents) of REFUNDED bookings
 *  - pending refund : amount of REFUND_PENDING / REFUND_FAILED bookings
 *  - collected      : net + refunded + pending refund  (money that ever came in)
 *  - platform fee   : SUM(platformFeeCents) of PAID bookings (the 5%)
 *  - last 30d       : PAID bookings whose paidAt is in the trailing 30 days.
 *                     This is a trailing-30-day figure, NOT MRR — the product
 *                     has per-booking payments only, no subscriptions.
 * Everything is aggregated in the database (groupBy / count), never by
 * fetching booking rows and summing in JavaScript. All amounts are USD cents.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(now: Date = new Date()): Promise<AdminOverview> {
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const d60 = new Date(now.getTime() - 60 * DAY_MS);

    const [
      spaces,
      memberGroups,
      zoneCounts,
      byStatus,
      paidByStatusAgg,
      last30,
      prev30,
      paidBySpace,
      paidBySpace30,
    ] = await Promise.all([
      this.prisma.space.findMany({
        select: { id: true, name: true, slug: true, createdAt: true, deletedAt: true },
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
          _count: {
            select: {
              desks: { where: LIVE },
              rooms: { where: LIVE },
            },
          },
        },
      }),
      this.prisma.booking.groupBy({
        by: ['paymentStatus'],
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['paymentStatus'],
        where: {
          paymentStatus: {
            in: ['PAID', 'REFUNDED', 'REFUND_PENDING', 'REFUND_FAILED'],
          },
        },
        _sum: {
          amountCents: true,
          platformFeeCents: true,
          refundedAmountCents: true,
        },
      }),
      this.prisma.booking.aggregate({
        where: { paymentStatus: 'PAID', paidAt: { gte: d30 } },
        _sum: { amountCents: true, platformFeeCents: true },
        _count: { _all: true },
      }),
      this.prisma.booking.aggregate({
        where: { paymentStatus: 'PAID', paidAt: { gte: d60, lt: d30 } },
        _sum: { amountCents: true },
      }),
      this.prisma.booking.groupBy({
        by: ['spaceId'],
        where: { paymentStatus: 'PAID' },
        _sum: { amountCents: true },
      }),
      this.prisma.booking.groupBy({
        by: ['spaceId'],
        where: { paymentStatus: 'PAID', paidAt: { gte: d30 } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);

    // ---- payments by status
    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) {
      statusCounts[row.paymentStatus] = row._count._all;
    }

    // ---- money
    const sum = (status: string, field: 'amountCents' | 'platformFeeCents' | 'refundedAmountCents') =>
      paidByStatusAgg.find((r) => r.paymentStatus === status)?._sum[field] ?? 0;

    const netCents = sum('PAID', 'amountCents');
    const platformFeeNetCents = sum('PAID', 'platformFeeCents');
    const refundedCents = sum('REFUNDED', 'refundedAmountCents');
    const pendingRefundCents =
      sum('REFUND_PENDING', 'amountCents') + sum('REFUND_FAILED', 'amountCents');

    const net30 = last30._sum.amountCents ?? 0;
    const netPrev30 = prev30._sum.amountCents ?? 0;
    const changePct =
      netPrev30 > 0 ? Math.round(((net30 - netPrev30) / netPrev30) * 100) : null;

    // ---- per space rows
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
    const netBySpace = new Map(paidBySpace.map((r) => [r.spaceId, r._sum.amountCents ?? 0]));
    const net30BySpace = new Map(
      paidBySpace30.map((r) => [r.spaceId, { net: r._sum.amountCents ?? 0, n: r._count._all }]),
    );

    const perSpace: SpaceRow[] = spaces
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: (s.deletedAt ? 'CLOSED' : 'ACTIVE') as 'ACTIVE' | 'CLOSED',
        createdAt: s.createdAt,
        members: membersBySpace.get(s.id) ?? 0,
        desks: desksBySpace.get(s.id) ?? 0,
        rooms: roomsBySpace.get(s.id) ?? 0,
        netCents: netBySpace.get(s.id) ?? 0,
        netCents30d: net30BySpace.get(s.id)?.net ?? 0,
        bookings30d: net30BySpace.get(s.id)?.n ?? 0,
      }))
      // Active spaces first, then by trailing-30-day revenue, then members.
      .sort(
        (a, b) =>
          Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') ||
          b.netCents30d - a.netCents30d ||
          b.members - a.members ||
          a.name.localeCompare(b.name),
      );

    const active = spaces.filter((s) => !s.deletedAt);

    return {
      generatedAt: now.toISOString(),
      spaces: {
        active: active.length,
        closed: spaces.length - active.length,
        createdLast30d: spaces.filter((s) => s.createdAt >= d30).length,
      },
      members: {
        total: [...membersBySpace.values()].reduce((a, b) => a + b, 0),
      },
      payments: { byStatus: statusCounts },
      revenue: {
        collectedCents: netCents + refundedCents + pendingRefundCents,
        refundedCents,
        pendingRefundCents,
        netCents,
        platformFeeNetCents,
        last30d: {
          netCents: net30,
          platformFeeNetCents: last30._sum.platformFeeCents ?? 0,
          bookings: last30._count._all,
        },
        prev30d: { netCents: netPrev30 },
        changePct,
      },
      perSpace,
    };
  }
}
