import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

 
 
    const zones = await this.prisma.zone.findMany({
      where: { spaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        desks: { select: { id: true } },
        rooms: { select: { id: true } },
      },
    });

  
    const results = await Promise.all(
      zones.map(async (zone) => {
        const deskIds = zone.desks.map((d) => d.id);
        const roomIds = zone.rooms.map((r) => r.id);

        const count = await this.prisma.booking.count({
          where: {
            spaceId,
            cancelledAt: null,
            OR: [
              { bookableType: 'DESK', bookableId: { in: deskIds } },
              { bookableType: 'ROOM', bookableId: { in: roomIds } },
            ],
          },
        });

        return { zoneId: zone.id, zoneName: zone.name, totalBookings: count };
      }),
    );

    return results;
  }


  async spaceSummary(spaceId: string) {
    // Resource counts (denominator of utilization) still come from the
    // live desks/rooms -- that is exactly what "utilization" should mean.
    const [deskCount, roomCount] = await Promise.all([
      this.prisma.desk.count({ where: { zone: { spaceId } } }),
      this.prisma.room.count({ where: { zone: { spaceId } } }),
    ]);
    const totalResourceCount = deskCount + roomCount;

    // Stage 9: bookings are scoped by their own spaceId snapshot, NOT by
    // joining through live desk/room ids -- otherwise deleting a desk would
    // silently remove its paid bookings from revenue. Cancelled bookings
    // (deleted-resource refunds) never count as bookings; their money
    // leaves `paymentStatus: PAID` on its own when refunded.
    const bookingWhere = { spaceId, cancelledAt: null };

    const now = new Date();

   
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const currentPeriodStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const previousPeriodStart = new Date(
      now.getTime() - 2 * THIRTY_DAYS_MS,
    );

    const [
      totalBookings,
      paidBookings,
      activeBookings,
      currentPeriodBookingCount,
      previousPeriodBookingCount,
      currentPeriodPaidBookings,
      previousPeriodPaidBookings,
    ] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),

      this.prisma.booking.findMany({
        where: { ...bookingWhere, paymentStatus: 'PAID' },
        select: { amountCents: true },
      }),

      this.prisma.booking.count({
        where: { ...bookingWhere, startTime: { lte: now }, endTime: { gte: now } },
      }),

      this.prisma.booking.count({
        where: { ...bookingWhere, createdAt: { gte: currentPeriodStart } },
      }),

      this.prisma.booking.count({
        where: {
          ...bookingWhere,
          createdAt: { gte: previousPeriodStart, lt: currentPeriodStart },
        },
      }),

      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          paymentStatus: 'PAID',
          createdAt: { gte: currentPeriodStart },
        },
        select: { amountCents: true },
      }),

      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          paymentStatus: 'PAID',
          createdAt: { gte: previousPeriodStart, lt: currentPeriodStart },
        },
        select: { amountCents: true },
      }),
    ]);

    const sumCents = (rows: { amountCents: number | null }[]) =>
      rows.reduce((sum, b) => sum + (b.amountCents ?? 0), 0);

    const totalRevenue = sumCents(paidBookings);
    const currentPeriodRevenue = sumCents(currentPeriodPaidBookings);
    const previousPeriodRevenue = sumCents(previousPeriodPaidBookings);

    const utilizationRate =
      totalResourceCount === 0 ? 0 : activeBookings / totalResourceCount;

    return {
      totalRevenue,
      activeBookings,
      totalBookings,
      utilizationRate,
     
      revenueChangePct: this.pctChange(
        currentPeriodRevenue,
        previousPeriodRevenue,
      ),
      totalBookingsChangePct: this.pctChange(
        currentPeriodBookingCount,
        previousPeriodBookingCount,
      ),
    };
  }

  
  async trends(spaceId: string, days = 30) {
    const window = Math.min(Math.max(Math.trunc(days) || 30, 7), 90);

    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (window - 1)),
    );
    const bookingWhere = { spaceId, cancelledAt: null };

    const [rows, typeGroups] = await Promise.all([
      this.prisma.booking.findMany({
        where: { ...bookingWhere, createdAt: { gte: start } },
        select: { createdAt: true, amountCents: true, paymentStatus: true },
      }),
      this.prisma.booking.groupBy({
        by: ['bookableType'],
        where: bookingWhere,
        _count: { _all: true },
      }),
    ]);

    const buckets = new Map<string, { bookings: number; revenueCents: number }>();
    for (let i = 0; i < window; i++) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(day.toISOString().slice(0, 10), { bookings: 0, revenueCents: 0 });
    }

    for (const row of rows) {
      const bucket = buckets.get(row.createdAt.toISOString().slice(0, 10));
      if (!bucket) continue;
      bucket.bookings += 1;
      if (row.paymentStatus === 'PAID') {
        bucket.revenueCents += row.amountCents ?? 0;
      }
    }

    const countFor = (type: 'DESK' | 'ROOM') =>
      typeGroups.find((g) => g.bookableType === type)?._count._all ?? 0;

    return {
      days: window,
      series: [...buckets].map(([date, v]) => ({ date, ...v })),
      byType: { desk: countFor('DESK'), room: countFor('ROOM') },
    };
  }

  private pctChange(current: number, previous: number): number | null {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }
    return ((current - previous) / previous) * 100;
  }
}
