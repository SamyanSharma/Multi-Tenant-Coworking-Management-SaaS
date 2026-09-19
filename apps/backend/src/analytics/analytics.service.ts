import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

 
  async bookingsPerZone(spaceId: string) {
    const zones = await this.prisma.zone.findMany({
      where: { spaceId },
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

    // "vs last month" cards used to show hardcoded literals (+12.5%
    // etc.) with no data behind them at all. Real comparison instead:
    // rolling 30-day windows rather than calendar months, so it's a
    // fair day-count comparison (today vs. 30 days ago) instead of a
    // full previous month vs. a partial current month.
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
      // null means "not expressible as a percentage" — e.g. previous
      // period was 0 and current period is >0 (infinite growth), or
      // there's simply no bookings/revenue in either period yet. The
      // frontend shows a neutral "New" badge instead of a fake number.
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

  private pctChange(current: number, previous: number): number | null {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }
    return ((current - previous) / previous) * 100;
  }
}
