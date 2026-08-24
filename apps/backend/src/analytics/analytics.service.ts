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
    
      this.prisma.booking.findMany({
        where: { ...bookingWhere, paymentStatus: 'PAID' },
        select: { amountCents: true },
      }),
      
      this.prisma.booking.count({
        where: { ...bookingWhere, startTime: { lte: now }, endTime: { gte: now } },
      }),
    ]);

    const totalRevenue = paidBookings.reduce(
      (sum, b) => sum + (b.amountCents ?? 0),
      0,
    );

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
