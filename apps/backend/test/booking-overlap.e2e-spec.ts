import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Proves the DB-level EXCLUDE constraint (see
// prisma/migrations/20260821202823_add_booking_overlap_exclusion and
// ARCHITECTURE.md's Concurrency Strategy) actually rejects genuine
// time-range overlaps, not just exact-start-time duplicates. Same
// pragmatic real-dev-DB approach as tenant-isolation.e2e-spec.ts.
describe('Booking overlap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let space: { id: string };
  let zone: { id: string };
  let desk: { id: string };
  let member: { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);

    space = await prisma.space.create({
      data: { name: 'Overlap Test Space', slug: `overlap-test-${Date.now()}` },
    });
    zone = await prisma.zone.create({
      data: { name: 'Zone', spaceId: space.id },
    });
    desk = await prisma.desk.create({
      data: { name: 'Desk 1', zoneId: zone.id },
    });
    member = await prisma.user.create({
      data: {
        email: `member-${Date.now()}@test.local`,
        role: 'MEMBER',
        spaceId: space.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { bookableId: desk.id } });
    await prisma.user.deleteMany({ where: { id: member.id } });
    await prisma.desk.deleteMany({ where: { id: desk.id } });
    await prisma.zone.deleteMany({ where: { id: zone.id } });
    await prisma.space.deleteMany({ where: { id: space.id } });
    await app.close();
  });

  it('accepts the first booking for a desk/time range', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('x-space-id', space.id)
      .set('x-user-role', 'MEMBER')
      .set('x-user-id', member.id)
      .send({
        bookableType: 'DESK',
        bookableId: desk.id,
        startTime: '2026-08-25T10:00:00.000Z',
        endTime: '2026-08-25T11:00:00.000Z',
      });

    expect(res.status).toBe(201);
  });

  it('rejects a genuinely overlapping booking (different startTime, overlapping range)', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('x-space-id', space.id)
      .set('x-user-role', 'MEMBER')
      .set('x-user-id', member.id)
      .send({
        bookableType: 'DESK',
        bookableId: desk.id,
        startTime: '2026-08-25T10:30:00.000Z',
        endTime: '2026-08-25T11:30:00.000Z',
      });

    // 409 requires bookings.service.ts to catch the Postgres exclusion-
    // violation error code (23P01), not just Prisma's P2002 — see
    // ARCHITECTURE.md's Concurrency Strategy open item.
    expect(res.status).toBe(409);
  });
});
