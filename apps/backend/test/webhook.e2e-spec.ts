import * as request from 'supertest';
import Stripe from 'stripe';
import { bootstrapE2e, createTenant, E2eContext } from './helpers/e2e-app';

// Real HTTP, real raw-body signature verification, real database. Proves the
// webhook is authenticated by Stripe's signature alone and that replayed or
// out-of-order events cannot corrupt a booking's payment state.
describe('Stripe webhook (e2e)', () => {
  let ctx: E2eContext;
  let T: Awaited<ReturnType<typeof createTenant>>;
  const stripe = new Stripe('sk_test_e2e_signer_only');

  const post = (event: object, secret = process.env.STRIPE_WEBHOOK_SECRET!) => {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    return request(ctx.app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(payload);
  };

  const evt = (type: string, piId: string, bookingId: string) => ({
    id: `evt_${ctx.uid()}`,
    object: 'event',
    type,
    data: { object: { id: piId, object: 'payment_intent', metadata: { bookingId } } },
  });

  const makeBooking = (start: string, data: Record<string, unknown>) =>
    ctx.prisma.booking.create({
      data: {
        bookableType: 'DESK',
        bookableId: T.desk.id,
        userId: T.member.id,
        spaceId: T.space.id,
        startTime: new Date(start),
        endTime: new Date(new Date(start).getTime() + 3_600_000),
        amountCents: 1000,
        ...data,
      } as never,
    });

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    T = await createTenant(ctx, 'Hook', { stripeOnboarded: true });
  });

  afterAll(async () => {
    await ctx.cleanup([T.space.id]);
    await ctx.app.close();
  });

  it('rejects an event with a bad signature (400) without touching the booking', async () => {
    const b = await makeBooking('2031-07-01T10:00:00.000Z', {
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_sig_1',
    });
    await post(evt('payment_intent.succeeded', 'pi_sig_1', b.id), 'whsec_wrong').expect(400);
    expect((await ctx.prisma.booking.findUnique({ where: { id: b.id } }))!.paymentStatus).toBe('PENDING');
  });

  it('marks a PENDING booking PAID and records paidAt', async () => {
    const b = await makeBooking('2031-07-02T10:00:00.000Z', {
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_ok_1',
      holdExpiresAt: new Date(Date.now() + 600_000),
    });
    await post(evt('payment_intent.succeeded', 'pi_ok_1', b.id)).expect(200);

    const after = await ctx.prisma.booking.findUnique({ where: { id: b.id } });
    expect(after!.paymentStatus).toBe('PAID');
    expect(after!.paidAt).not.toBeNull();
    expect(after!.holdExpiresAt).toBeNull();
  });

  it('a replayed succeeded event is a no-op: paidAt is not rewritten', async () => {
    const b = await makeBooking('2031-07-03T10:00:00.000Z', {
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_replay_1',
    });
    await post(evt('payment_intent.succeeded', 'pi_replay_1', b.id)).expect(200);
    const first = await ctx.prisma.booking.findUnique({ where: { id: b.id } });

    await new Promise((r) => setTimeout(r, 20));
    await post(evt('payment_intent.succeeded', 'pi_replay_1', b.id)).expect(200);
    const second = await ctx.prisma.booking.findUnique({ where: { id: b.id } });

    expect(second!.paidAt!.getTime()).toBe(first!.paidAt!.getTime());
  });

  it('a late payment_failed can NOT flip a PAID booking back to FAILED', async () => {
    const b = await makeBooking('2031-07-04T10:00:00.000Z', {
      paymentStatus: 'PAID',
      paidAt: new Date(),
      stripePaymentIntentId: 'pi_paid_1',
    });
    await post(evt('payment_intent.payment_failed', 'pi_paid_1', b.id)).expect(200);
    expect((await ctx.prisma.booking.findUnique({ where: { id: b.id } }))!.paymentStatus).toBe('PAID');
  });

  it('a stale payment_failed for an abandoned first attempt does not fail a booking that was retried', async () => {
    const b = await makeBooking('2031-07-05T10:00:00.000Z', {
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_second_attempt',
    });
    await post(evt('payment_intent.payment_failed', 'pi_first_attempt', b.id)).expect(200);
    expect((await ctx.prisma.booking.findUnique({ where: { id: b.id } }))!.paymentStatus).toBe('PENDING');
  });

  it('a late succeeded event can NOT pull a REFUNDED booking back to PAID', async () => {
    const b = await makeBooking('2031-07-06T10:00:00.000Z', {
      paymentStatus: 'REFUNDED',
      stripePaymentIntentId: 'pi_refunded_1',
      cancelledAt: new Date(),
      cancellationReason: 'RESOURCE_DELETED',
    });
    await post(evt('payment_intent.succeeded', 'pi_refunded_1', b.id)).expect(200);
    expect((await ctx.prisma.booking.findUnique({ where: { id: b.id } }))!.paymentStatus).toBe('REFUNDED');
  });

  it('a genuine decline moves the booking PENDING -> FAILED', async () => {
    const b = await makeBooking('2031-07-07T10:00:00.000Z', {
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_decl_1',
    });
    await post(evt('payment_intent.payment_failed', 'pi_decl_1', b.id)).expect(200);
    expect((await ctx.prisma.booking.findUnique({ where: { id: b.id } }))!.paymentStatus).toBe('FAILED');
  });
});
