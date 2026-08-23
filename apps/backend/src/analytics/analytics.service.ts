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
   * High-level summary for the caller's space.
   *
   * Field names here are a deliberate CONTRACT with
   * apps/frontend/app/dashboard/analytics/page.tsx, which was built
   * against this exact shape (see the comment at the top of that file):
   *
   *   { totalRevenue, activeBookings, totalBookings, utilizationRate }
   *
   * This used to return { zoneCount, deskCount, roomCount, totalBookings,
   * totalRevenueCents } instead — a genuine field-name mismatch (no
   * `activeBookings`/`utilizationRate` at all, `totalRevenueCents` vs.
   * `totalRevenue`) that would have thrown at render time
   * (`summary.activeBookings.toLocaleString()` on `undefined`). Fixed by
   * making the backend match the already-built frontend contract, since
   * the frontend's card layout was the more deliberately designed side
   * of the two.
   */
  async spaceSummary(spaceId: string) {
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
    const totalResourceCount = deskIds.length + roomIds.length;

    const bookingWhere = {
      OR: [
        { bookableType: 'DESK' as const, bookableId: { in: deskIds } },
        { bookableType: 'ROOM' as const, bookableId: { in: roomIds } },
      ],
    };

    const now = new Date();

    const [totalBookings, paidBookings, activeBookings] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),
      // Revenue actually collected: PAID only. PENDING/FAILED/UNPAID
      // excluded, since counting those would overstate what the space
      // has actually been paid.
      this.prisma.booking.findMany({
        where: { ...bookingWhere, paymentStatus: 'PAID' },
        select: { amountCents: true },
      }),
      // "Active" = booked right now (startTime <= now <= endTime) —
      // same definition FloorPlan.tsx's isBookedNow() uses on the
      // frontend, so this number matches what the live floor plan shows.
      this.prisma.booking.count({
        where: { ...bookingWhere, startTime: { lte: now }, endTime: { gte: now } },
      }),
    ]);

    const totalRevenue = paidBookings.reduce(
      (sum, b) => sum + (b.amountCents ?? 0),
      0,
    );

    // Fraction of bookable resources currently occupied. 0 (not NaN)
    // when a space has no desks/rooms yet, since "0 of 0 booked" reads
    // as 0% used, not undefined.
    const utilizationRate =
      totalResourceCount === 0 ? 0 : activeBookings / totalResourceCount;

    return {
      totalRevenue,
      activeBookings,
      totalBookings,
      utilizationRate,
    };
  }
}
