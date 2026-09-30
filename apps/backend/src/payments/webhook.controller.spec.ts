import { BadRequestException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';

function build() {
  const prisma = {
    booking: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { update: jest.fn() },
  };
  const stripeService = { constructWebhookEvent: jest.fn() };
  const controller = new WebhookController(stripeService as any, prisma as any);

  const send = (event: unknown) => {
    stripeService.constructWebhookEvent.mockReturnValue(event);
    return controller.handleWebhook(
      { rawBody: Buffer.from('{}') } as any,
      't=1,v1=sig',
    );
  };

  return { controller, prisma, stripeService, send };
}

const succeeded = (bookingId: string | undefined = 'booking-1') => ({
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1', metadata: bookingId ? { bookingId } : {} } },
});
const failed = (bookingId = 'booking-1') => ({
  type: 'payment_intent.payment_failed',
  data: { object: { id: 'pi_1', metadata: { bookingId } } },
});

describe('WebhookController', () => {
  it('rejects a request with no stripe-signature header', async () => {
    const { controller } = build();
    await expect(
      controller.handleWebhook({ rawBody: Buffer.from('{}') } as any, undefined as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an event whose signature does not verify', async () => {
    const { controller, stripeService } = build();
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    await expect(
      controller.handleWebhook({ rawBody: Buffer.from('{}') } as any, 'bad'),
    ).rejects.toThrow(BadRequestException);
  });

  describe('payment_intent.succeeded', () => {
    it('only moves a booking that is still waiting for payment to PAID (UNPAID/PENDING/FAILED)', async () => {
      const { send, prisma } = build();
      await send(succeeded());

      const arg = prisma.booking.updateMany.mock.calls[0][0];
      expect(arg.where.id).toBe('booking-1');
      expect(arg.where.paymentStatus).toEqual({ in: ['UNPAID', 'PENDING', 'FAILED'] });
      expect(arg.where.cancelledAt).toBeNull();
      expect(arg.data.paymentStatus).toBe('PAID');
      expect(arg.data.holdExpiresAt).toBeNull();
      expect(arg.data.paidAt).toBeInstanceOf(Date);
    });

    it('never targets PAID, REFUND_* rows, so a replayed event cannot rewrite paidAt or un-refund a booking', async () => {
      const { send, prisma } = build();
      await send(succeeded());
      const allowed: string[] =
        prisma.booking.updateMany.mock.calls[0][0].where.paymentStatus.in;
      for (const s of ['PAID', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']) {
        expect(allowed).not.toContain(s);
      }
    });

    it('is a harmless no-op (still 200) when the booking is not eligible', async () => {
      const { send, prisma } = build();
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(send(succeeded())).resolves.toEqual({ received: true });
    });

    it('does nothing when the PaymentIntent carries no bookingId', async () => {
      const { send, prisma } = build();
      await send(succeeded(''));
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('only fails the booking if THIS PaymentIntent is the one it is waiting on', async () => {
      const { send, prisma } = build();
      await send(failed());

      const arg = prisma.booking.updateMany.mock.calls[0][0];
      expect(arg.where.stripePaymentIntentId).toBe('pi_1');
      expect(arg.where.paymentStatus).toEqual({ in: ['UNPAID', 'PENDING'] });
      expect(arg.data).toEqual({ paymentStatus: 'FAILED' });
    });

    it('can never overwrite a PAID or refunded booking', async () => {
      const { send, prisma } = build();
      await send(failed());
      const allowed: string[] =
        prisma.booking.updateMany.mock.calls[0][0].where.paymentStatus.in;
      for (const s of ['PAID', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED', 'FAILED']) {
        expect(allowed).not.toContain(s);
      }
    });
  });

  it('ignores event types it does not handle', async () => {
    const { send, prisma } = build();
    await expect(send({ type: 'charge.updated', data: { object: {} } })).resolves.toEqual({
      received: true,
    });
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});
