import * as request from 'supertest';
import { bootstrapE2e, createTenant, E2eContext } from './helpers/e2e-app';

// Proves the DB-level EXCLUDE constraint (migration
// 20260821202823_add_booking_overlap_exclusion) rejects genuine time-range
// overlaps - and does so atomically under concurrent requests, which is the
// whole point of enforcing it in Postgres instead of in application code.
describe('Booking overlap (e2e)', () => {
  let ctx: E2eContext;
  let T: Awaited<ReturnType<typeof createTenant>>;

  const book = (start: string, end: string, token = T.memberToken, desk = T.desk.id) =>
    request(ctx.app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookableType: 'DESK', bookableId: desk, startTime: start, endTime: end });

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    T = await createTenant(ctx, 'Overlap');
  });

  afterAll(async () => {
    await ctx.cleanup([T.space.id]);
    await ctx.app.close();
  });

  it('accepts the first booking for a desk/time range', async () => {
    const res = await book('2031-05-01T10:00:00.000Z', '2031-05-01T11:00:00.000Z');
    expect(res.status).toBe(201);
    // Manager has not finished Stripe onboarding -> no payment needed, no clientSecret.
    expect(res.body.paymentStatus).toBe('UNPAID');
  });

  it('rejects a genuinely overlapping booking (different startTime, overlapping range) with 409', async () => {
    const res = await book('2031-05-01T10:30:00.000Z', '2031-05-01T11:30:00.000Z');
    expect(res.status).toBe(409);
  });

  it('rejects an identical slot with 409', async () => {
    const res = await book('2031-05-01T10:00:00.000Z', '2031-05-01T11:00:00.000Z');
    expect(res.status).toBe(409);
  });

  it('allows a back-to-back booking (ranges are half-open: 11:00 start does not clash with 11:00 end)', async () => {
    const res = await book('2031-05-01T11:00:00.000Z', '2031-05-01T12:00:00.000Z');
    expect(res.status).toBe(201);
  });

  it('exactly ONE of several simultaneous requests for the same slot wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        book('2031-06-01T09:00:00.000Z', '2031-06-01T10:00:00.000Z'),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);

    const stored = await ctx.prisma.booking.count({
      where: { bookableId: T.desk.id, startTime: new Date('2031-06-01T09:00:00.000Z') },
    });
    expect(stored).toBe(1);
  });
});
