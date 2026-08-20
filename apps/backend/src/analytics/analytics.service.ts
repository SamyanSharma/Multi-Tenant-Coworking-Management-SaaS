import { Injectable } from '@nestjs/common';
import { BookableType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(spaceId: string) {
    const [desks, rooms] = await Promise.all([
      this.prisma.desk.findMany({ where: { zone: { spaceId } }, select: { id: true } }),
      this.prisma.room.findMany({ where: { zone: { spaceId } }, select: { id: true } }),
    ]);
    const deskIds = desks.map((d) => d.id);
    const roomIds = rooms.map((r) => r.id);

    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { bookableType: BookableType.DESK, bookableId: { in: deskIds } },
          { bookableType: BookableType.ROOM, bookableId: { in: roomIds } },
        ],
      },
    });

    const now = new Date();
    const activeBookings = bookings.filter((b) => b.endTime >= now).length;

    return {
      totalRevenue: 0, // needs billing module first
      activeBookings,
      totalBookings: bookings.length,
      utilizationRate: 0, // needs a defined available-hours concept — real product decision, not just missing code
    };
  }
}
