import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeletionService } from './deletion.service';

const SPACE = 'space-1';
const FUTURE = new Date(Date.now() + 24 * 3600 * 1000);

const deskRow = (over: Record<string, unknown> = {}) => ({
  id: 'desk-1',
  name: 'Desk A1',
  deletedAt: null,
  zone: { spaceId: SPACE },
  ...over,
});

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b-1',
  bookableType: 'DESK',
  bookableId: 'desk-1',
  paymentStatus: 'PAID',
  amountCents: 2500,
  stripePaymentIntentId: 'pi_1',
  ...over,
});

function build(opts: { active?: any[]; desk?: any; zone?: any } = {}) {
  const prisma: any = {
    desk: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.desk === undefined ? deskRow() : opts.desk),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    room: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    zone: {
      findUnique: jest.fn().mockResolvedValue(opts.zone ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(opts.active ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));

  const stripe: any = {
    refundBookingPayment: jest
      .fn()
      .mockResolvedValue({ id: 're_1', status: 'succeeded', amount: 2500 }),
    cancelPaymentIntent: jest.fn().mockResolvedValue('canceled'),
  };
  const gateway: any = { emitToSpace: jest.fn() };

  return {
    service: new DeletionService(prisma, stripe, gateway),
    prisma,
    stripe,
    gateway,
  };
}

describe('DeletionService — tenant safety', () => {
  it("404s for another tenant's desk (never confirms it exists)", async () => {
    const { service, prisma } = build({
      desk: deskRow({ zone: { spaceId: 'OTHER' } }),
    });
    await expect(
      service.remove('DESK', 'desk-1', SPACE, { confirmRefund: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.desk.updateMany).not.toHaveBeenCalled();
  });

  it('404s for an already-deleted desk', async () => {
    const { service } = build({ desk: deskRow({ deletedAt: new Date() }) });
    await expect(
      service.getImpact('DESK', 'desk-1', SPACE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when a concurrent delete wins the race (updateMany matches 0 rows)', async () => {
    const { service, prisma } = build();
    prisma.desk.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.remove('DESK', 'desk-1', SPACE, { confirmRefund: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DeletionService — delete with no active bookings', () => {
  it('soft-deletes (sets deletedAt, never hard-deletes) and touches no Stripe', async () => {
    const { service, prisma, stripe, gateway } = build();

    const result = await service.remove('DESK', 'desk-1', SPACE, {
      confirmRefund: false,
    });

    expect(prisma.desk.updateMany).toHaveBeenCalledWith({
      where: { id: 'desk-1', deletedAt: null, zone: { spaceId: SPACE } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.desk).not.toHaveProperty('delete');
    expect(stripe.refundBookingPayment).not.toHaveBeenCalled();
    expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(result).toEqual({
      deleted: { type: 'DESK', id: 'desk-1', name: 'Desk A1' },
      cancelledBookings: 0,
      refunds: { succeeded: 0, failed: 0, refundedCents: 0 },
    });
    expect(gateway.emitToSpace).toHaveBeenCalledWith(
      SPACE,
      'resource_deleted',
      { type: 'DESK', id: 'desk-1', deskIds: ['desk-1'], roomIds: [] },
    );
  });

  it('only considers upcoming, non-cancelled bookings as "active"', async () => {
    const { service, prisma } = build();
    await service.getImpact('DESK', 'desk-1', SPACE);
    const where = prisma.booking.findMany.mock.calls[0][0].where;
    expect(where.spaceId).toBe(SPACE);
    expect(where.cancelledAt).toBeNull();
    expect(where.endTime).toEqual({ gt: expect.any(Date) });
  });
});

describe('DeletionService — active bookings', () => {
  it('409 ACTIVE_BOOKINGS with the impact, and changes NOTHING, when not confirmed', async () => {
    const { service, prisma, stripe } = build({
      active: [
        booking(),
        booking({ id: 'b-2', paymentStatus: 'UNPAID', amountCents: null, stripePaymentIntentId: null }),
      ],
    });

    let err: any;
    try {
      await service.remove('DESK', 'desk-1', SPACE, { confirmRefund: false });
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'ACTIVE_BOOKINGS',
      impact: {
        target: { type: 'DESK', id: 'desk-1', name: 'Desk A1' },
        activeBookings: {
          count: 2,
          paid: 1,
          unpaid: 1,
          holds: 0,
          refundTotalCents: 2500,
        },
      },
    });
    // thrown inside the transaction => nothing was written
    expect(prisma.desk.updateMany).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(stripe.refundBookingPayment).not.toHaveBeenCalled();
  });

  it('confirmed: PAID -> REFUND_PENDING in the tx, then a full Stripe refund keyed by booking id, then REFUNDED', async () => {
    const { service, prisma, stripe, gateway } = build({ active: [booking()] });

    const result = await service.remove('DESK', 'desk-1', SPACE, {
      confirmRefund: true,
    });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b-1'] } },
      data: {
        paymentStatus: 'REFUND_PENDING',
        cancelledAt: expect.any(Date),
        cancellationReason: 'RESOURCE_DELETED',
        holdExpiresAt: null,
      },
    });
    expect(stripe.refundBookingPayment).toHaveBeenCalledWith('pi_1', 'b-1');
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: {
        paymentStatus: 'REFUNDED',
        stripeRefundId: 're_1',
        refundedAmountCents: 2500,
      },
    });
    expect(result.cancelledBookings).toBe(1);
    expect(result.refunds).toEqual({
      succeeded: 1,
      failed: 0,
      refundedCents: 2500,
    });
    expect(gateway.emitToSpace).toHaveBeenCalledWith(SPACE, 'booking_cancelled', {
      id: 'b-1',
      bookableType: 'DESK',
      bookableId: 'desk-1',
    });
  });

  it('confirmed: an UNPAID booking is cancelled with no Stripe call at all', async () => {
    const { service, prisma, stripe } = build({
      active: [booking({ paymentStatus: 'UNPAID', amountCents: null, stripePaymentIntentId: null })],
    });

    await service.remove('DESK', 'desk-1', SPACE, { confirmRefund: true });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b-1'] } },
      data: {
        cancelledAt: expect.any(Date),
        cancellationReason: 'RESOURCE_DELETED',
        holdExpiresAt: null,
      },
    });
    expect(stripe.refundBookingPayment).not.toHaveBeenCalled();
    expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('a refund that FAILS is recorded REFUND_FAILED and the delete still succeeds', async () => {
    const { service, prisma, stripe } = build({ active: [booking()] });
    stripe.refundBookingPayment.mockRejectedValue(new Error('balance_insufficient'));

    const result = await service.remove('DESK', 'desk-1', SPACE, {
      confirmRefund: true,
    });

    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { paymentStatus: 'REFUND_FAILED' },
    });
    expect(result.refunds).toEqual({ succeeded: 0, failed: 1, refundedCents: 0 });
    expect(result.deleted.id).toBe('desk-1');
  });

  it('a held (PENDING) booking has its PaymentIntent cancelled, not refunded', async () => {
    const { service, prisma, stripe } = build({
      active: [booking({ paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_hold' })],
    });

    await service.remove('DESK', 'desk-1', SPACE, { confirmRefund: true });

    expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_hold');
    expect(stripe.refundBookingPayment).not.toHaveBeenCalled();
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { paymentStatus: 'FAILED' },
    });
  });

  it('if the member paid an instant before the cancel, that money is refunded', async () => {
    const { service, prisma, stripe } = build({
      active: [booking({ paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_late' })],
    });
    stripe.cancelPaymentIntent.mockResolvedValue('succeeded');

    await service.remove('DESK', 'desk-1', SPACE, { confirmRefund: true });

    expect(stripe.refundBookingPayment).toHaveBeenCalledWith('pi_late', 'b-1');
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: expect.objectContaining({ paymentStatus: 'REFUNDED' }),
    });
  });
});

describe('DeletionService — zone cascade', () => {
  const zone = {
    id: 'zone-1',
    name: 'Focus',
    spaceId: SPACE,
    deletedAt: null,
    desks: [{ id: 'd1' }, { id: 'd2' }],
    rooms: [{ id: 'r1' }],
  };

  it('deleting a zone soft-deletes its desks and rooms with the SAME timestamp', async () => {
    const { service, prisma } = build({ zone });

    await service.remove('ZONE', 'zone-1', SPACE, { confirmRefund: false });

    const zoneCall = prisma.zone.updateMany.mock.calls[0][0];
    const deskCall = prisma.desk.updateMany.mock.calls[0][0];
    const roomCall = prisma.room.updateMany.mock.calls[0][0];
    expect(zoneCall.where).toEqual({ id: 'zone-1', spaceId: SPACE, deletedAt: null });
    expect(deskCall.where).toEqual({ zoneId: 'zone-1', deletedAt: null });
    expect(roomCall.where).toEqual({ zoneId: 'zone-1', deletedAt: null });
    expect(deskCall.data.deletedAt).toBe(zoneCall.data.deletedAt);
    expect(roomCall.data.deletedAt).toBe(zoneCall.data.deletedAt);
  });

  it('the impact reports how many desks/rooms go with the zone and checks bookings on all of them', async () => {
    const { service, prisma } = build({ zone });

    const impact = await service.getImpact('ZONE', 'zone-1', SPACE);

    expect(impact.children).toEqual({ desks: 2, rooms: 1 });
    const where = prisma.booking.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { bookableType: 'DESK', bookableId: { in: ['d1', 'd2'] } },
      { bookableType: 'ROOM', bookableId: { in: ['r1'] } },
    ]);
  });
});

describe('DeletionService.retryRefund', () => {
  it('re-runs the refund for a REFUND_FAILED booking of this space', async () => {
    const { service, prisma, stripe } = build();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      stripePaymentIntentId: 'pi_1',
    });
    prisma.booking.findUnique.mockResolvedValue({
      id: 'b-1',
      paymentStatus: 'REFUNDED',
      refundedAmountCents: 2500,
      stripeRefundId: 're_1',
    });

    const r = await service.retryRefund('b-1', SPACE);

    expect(prisma.booking.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'b-1',
      spaceId: SPACE,
      paymentStatus: { in: ['REFUND_FAILED', 'REFUND_PENDING'] },
    });
    expect(stripe.refundBookingPayment).toHaveBeenCalledWith('pi_1', 'b-1');
    expect(r.ok).toBe(true);
  });

  it('404s when the booking is not awaiting a refund retry in this space', async () => {
    const { service, prisma } = build();
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(service.retryRefund('nope', SPACE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
