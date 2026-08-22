import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Same pragmatic approach as tenant-isolation.e2e-spec.ts: hits a real
// (dev) database via PrismaService rather than a dedicated test DB.
//
// This test exists specifically to cover the cross-tenant checkout bug
// found in review: BillingService.createCheckoutSession() previously
// looked up a booking by id with no check that it belonged to the
// caller's space, letting a MEMBER in Space B generate a Stripe Checkout
// session against a booking that belongs to Space A. See
// billing.service.ts's assertBookingInSpace() for the fix.
describe('Billing tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let spaceA: { id: string };
  let spaceB: { id: string };
  let zoneInSpaceA: { id: string };
  let deskInSpaceA: { id: string };
  let memberInSpaceA: { id: string };
  let bookingInSpaceA: { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);

    spaceA = await prisma.space.create({
      data: { name: 'Billing Space A', slug: `billing-space-a-${Date.now()}` },
    });
    spaceB = await prisma.space.create({
      data: { name: 'Billing Space B', slug: `billing-space-b-${Date.now()}` },
    });
    zoneInSpaceA = await prisma.zone.create({
      data: { name: 'Zone A1', spaceId: spaceA.id },
    });
    deskInSpaceA = await prisma.desk.create({
      data: { name: 'Desk A1', zoneId: zoneInSpaceA.id },
    });
    memberInSpaceA = await prisma.user.create({
      data: {
        email: `member-a-${Date.now()}@example.com`,
        role: 'MEMBER',
        spaceId: spaceA.id,
      },
    });
    bookingInSpaceA = await prisma.booking.create({
      data: {
        bookableType: 'DESK',
        bookableId: deskInSpaceA.id,
        userId: memberInSpaceA.id,
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { id: bookingInSpaceA.id } });
    await prisma.user.deleteMany({ where: { id: memberInSpaceA.id } });
    await prisma.zone.deleteMany({ where: { spaceId: { in: [spaceA.id, spaceB.id] } } });
    await prisma.space.deleteMany({ where: { id: { in: [spaceA.id, spaceB.id] } } });
    await app.close();
  });

  it("rejects a checkout for Space A's booking when scoped as Space B", async () => {
    // This is the regression test for the IDOR found in review: before the
    // fix, this would have proceeded straight to Stripe (or failed later
    // for an unrelated reason) instead of rejecting at the tenant check.
    await request(app.getHttpServer())
      .post('/billing/checkout')
      .set('x-space-id', spaceB.id)
      .set('x-user-role', 'MEMBER')
      .set('x-user-id', memberInSpaceA.id)
      .send({ bookingId: bookingInSpaceA.id })
      .expect(404);
  });

  it("rejects a checkout for someone else's booking within the SAME space", async () => {
    const otherMemberInSpaceA = await prisma.user.create({
      data: {
        email: `member-a-other-${Date.now()}@example.com`,
        role: 'MEMBER',
        spaceId: spaceA.id,
      },
    });

    await request(app.getHttpServer())
      .post('/billing/checkout')
      .set('x-space-id', spaceA.id)
      .set('x-user-role', 'MEMBER')
      .set('x-user-id', otherMemberInSpaceA.id)
      .send({ bookingId: bookingInSpaceA.id })
      .expect(400);

    await prisma.user.deleteMany({ where: { id: otherMemberInSpaceA.id } });
  });
});
