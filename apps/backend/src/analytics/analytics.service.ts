import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Total bookings per zone, for the caller's space only.
   *
   * Same structural constraint as BookingsService.findAllForSpace:
   * Booking.bookableId is not a real FK (polymorphic, per
   * ARCHITECTURE.md), so there's no single Prisma `groupBy` that can walk
   * Booking -> Desk/Room -> Zone in one query. This resolves the
   * space's zones/desks/rooms first, then counts bookings against those
   * known-safe ids — the isolation boundary is enforced by only ever
   * counting bookings whose bookableId came from THIS space's desks/rooms,
   * never by trusting a zoneId passed in from outside.
   */
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

    // One query per zone rather than one giant query + in-memory join —
    // for this project's scale (a handful of zones per space, not
    // thousands), clarity wins over the marginal performance gain of a
    // more clever single query. Revisit if a space ever has enough zones
    // for this to matter.
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

  /**
   * High-level summary for the caller's space: resource counts, total
   * bookings, and revenue actually collected (PAID bookings only —
   * PENDING/FAILED/UNPAID excluded, since counting those as revenue
   * would overstate what the space has actually been paid).
   */
  async spaceSummary(spaceId: string) {
    const [zoneCount, deskCount, roomCount] = await Promise.all([
      this.prisma.zone.count({ where: { spaceId } }),
      this.prisma.desk.count({ where: { zone: { spaceId } } }),
      this.prisma.room.count({ where: { zone: { spaceId } } }),
    ]);

    const [desks, rooms] = await Promise.all([
      this.prisma.desk.findMany({
        where: { zone: { spaceId } },
        select: { id: true },
      }),
      this.prisma.room.findMany({
        where: { zone: { spaceId } },
        select: { id: true },
      }),
    ]);
    const deskIds = desks.map((d) => d.id);
    const roomIds = rooms.map((r) => r.id);

    const bookingWhere = {
      OR: [
        { bookableType: 'DESK' as const, bookableId: { in: deskIds } },
        { bookableType: 'ROOM' as const, bookableId: { in: roomIds } },
      ],
    };

    const [totalBookings, paidBookings] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),
      this.prisma.booking.findMany({
        where: { ...bookingWhere, paymentStatus: 'PAID' },
        select: { amountCents: true },
      }),
    ]);

    const totalRevenueCents = paidBookings.reduce(
      (sum, b) => sum + (b.amountCents ?? 0),
      0,
    );

    return {
      zoneCount,
      deskCount,
      roomCount,
      totalBookings,
      totalRevenueCents,
    };
  }
}
