import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { StripeService } from '../src/payments/stripe.service';
import { bootstrapE2e, createTenant, E2eContext } from './helpers/e2e-app';

// Payment-retry and booking-hold behaviour against the real database, with
// Stripe replaced by a slow fake (150 ms per PaymentIntent) so concurrent
// requests genuinely overlap.
describe('Payment retry & holds (e2e)', () => {
  let ctx: E2eContext;
  let T: Awaited<ReturnType<typeof createTenant>>;
  let createIntentCalls = 0;
  let failNextIntent = false;

  const fakeStripe = {
    createBookingPaymentIntent: jest.fn(async () => {
      createIntentCalls++;
      await new Promise((r) => setTimeout(r, 150));
      if (failNextIntent) {
        failNextIntent = false;
        throw new Error('stripe is down');
      }
      // stripePaymentIntentId is UNIQUE in the schema, so every fake
      // PaymentIntent needs a globally unique id (the call counter alone
      // is reset between tests and would collide).
      return {
        id: `pi_fake_${randomUUID()}`,
        client_secret: `secret_${createIntentCalls}`,
        application_fee_amount: 50,
      };
    }),
    cancelPaymentIntent: jest.fn(async () => 'canceled' as const),
    getPaymentIntentStatus: jest.fn(async () => ({
      status: 'requires_payment_method',
      hasFailedAttempt: false,
    })),
  };

  const http = () => request(ctx.app.getHttpServer());

  const failedBooking = (start: string, extra: Record<string, unknown> = {}) =>
    ctx.prisma.booking.create({
      data: {
        bookableType: 'DESK',
        bookableId: T.desk.id,
        userId: T.member.id,
        spaceId: T.space.id,
        startTime: new Date(start),
        endTime: new Date(new Date(start).getTime() + 3_600_000),
        amountCents: 1000,
        paymentStatus: 'FAILED',
        stripePaymentIntentId: `pi_old_${ctx.uid()}`,
        holdExpiresAt: new Date(Date.now() + 10 * 60_000),
        ...extra,
      } as never,
    });

  beforeAll(async () => {
    ctx = await bootstrapE2e((b) => b.overrideProvider(StripeService).useValue(fakeStripe));
    T = await createTenant(ctx, 'Retry', { stripeOnboarded: true });
  });

  beforeEach(() => {
    createIntentCalls = 0;
    failNextIntent = false;
    fakeStripe.createBookingPaymentIntent.mockClear();
  });

  afterAll(async () => {
    await ctx.cleanup([T.space.id]);
    await ctx.app.close();
  });

  it('five simultaneous retries create exactly ONE PaymentIntent; the rest get 409', async () => {
    const b = await failedBooking('2031-08-01T10:00:00.000Z');

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        http().post(`/bookings/${b.id}/pay`).set('Authorization', `Bearer ${T.memberToken}`),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(fakeStripe.createBookingPaymentIntent).toHaveBeenCalledTimes(1);

    const after = await ctx.prisma.booking.findUnique({ where: { id: b.id } });
    expect(after!.paymentStatus).toBe('PENDING');
    expect(after!.stripePaymentIntentId).toMatch(/^pi_fake_/);
  });

  it('puts the booking back to FAILED (retryable) if Stripe errors, instead of stranding it PENDING', async () => {
    const b = await failedBooking('2031-08-02T10:00:00.000Z');
    failNextIntent = true;

    const res = await http()
      .post(`/bookings/${b.id}/pay`)
      .set('Authorization', `Bearer ${T.memberToken}`);
    expect(res.status).toBeGreaterThanOrEqual(500);

    const after = await ctx.prisma.booking.findUnique({ where: { id: b.id } });
    expect(after!.paymentStatus).toBe('FAILED');

    // ...and a second attempt now succeeds.
    await http()
      .post(`/bookings/${b.id}/pay`)
      .set('Authorization', `Bearer ${T.memberToken}`)
      .expect(201);
  });

  it("404s when a member tries to pay for someone else's booking", async () => {
    const other = await ctx.prisma.user.create({
      data: { email: `other-${ctx.uid()}@e2e.local`, role: 'MEMBER', spaceId: T.space.id },
    });
    const b = await failedBooking('2031-08-03T10:00:00.000Z', { userId: other.id });

    await http()
      .post(`/bookings/${b.id}/pay`)
      .set('Authorization', `Bearer ${T.memberToken}`)
      .expect(404);
    expect(fakeStripe.createBookingPaymentIntent).not.toHaveBeenCalled();
  });

  it('a new paid booking is inserted PENDING with a hold and returns a clientSecret', async () => {
    const res = await http()
      .post('/bookings')
      .set('Authorization', `Bearer ${T.memberToken}`)
      .send({
        bookableType: 'DESK',
        bookableId: T.desk.id,
        startTime: '2031-08-04T10:00:00.000Z',
        endTime: '2031-08-04T11:00:00.000Z',
      })
      .expect(201);

    expect(res.body.clientSecret).toMatch(/^secret_/);
    const row = await ctx.prisma.booking.findUnique({ where: { id: res.body.id } });
    expect(row!.paymentStatus).toBe('PENDING');
    expect(row!.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('if Stripe fails while creating a paid booking, the slot is released (409) and can be booked again', async () => {
    failNextIntent = true;
    const body = {
      bookableType: 'DESK',
      bookableId: T.desk.id,
      startTime: '2031-08-05T10:00:00.000Z',
      endTime: '2031-08-05T11:00:00.000Z',
    };

    await http().post('/bookings').set('Authorization', `Bearer ${T.memberToken}`).send(body).expect(409);
    expect(await ctx.prisma.booking.count({ where: { bookableId: T.desk.id, startTime: new Date(body.startTime) } })).toBe(0);

    await http().post('/bookings').set('Authorization', `Bearer ${T.memberToken}`).send(body).expect(201);
  });
  it('an expired hold is released by the next booking attempt: its PaymentIntent is cancelled first, then the slot can be rebooked', async () => {
    const start = new Date('2031-08-06T10:00:00.000Z');
    const stale = await ctx.prisma.booking.create({
      data: {
        bookableType: 'DESK',
        bookableId: T.desk.id,
        userId: T.member.id,
        spaceId: T.space.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        amountCents: 1000,
        paymentStatus: 'PENDING',
        stripePaymentIntentId: `pi_abandoned_${ctx.uid()}`,
        holdExpiresAt: new Date(Date.now() - 60_000), // lapsed a minute ago
      } as never,
    });
    fakeStripe.cancelPaymentIntent.mockClear();

    await http()
      .post('/bookings')
      .set('Authorization', `Bearer ${T.memberToken}`)
      .send({
        bookableType: 'DESK',
        bookableId: T.desk.id,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 3_600_000).toISOString(),
      })
      .expect(201);

    expect(fakeStripe.cancelPaymentIntent).toHaveBeenCalledWith(stale.stripePaymentIntentId);
    expect(await ctx.prisma.booking.findUnique({ where: { id: stale.id } })).toBeNull();
  });
});
