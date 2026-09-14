import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BookableType } from '@prisma/client';
import { BookingsService } from './bookings.service';

const FUTURE_START = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

function buildDeps() {
  const prisma: any = {
    desk: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'desk-1',
        zone: { spaceId: 'space-1' },
      }),
      findMany: jest.fn().mockResolvedValue([{ id: 'desk-1' }]),
    },
    room: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    space: {
      findUnique: jest.fn().mockResolvedValue({ priceCents: 1000 }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'manager-1',
        stripeAccountId: 'acct_123',
        stripeOnboardingComplete: true,
      }),
    },
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb({ booking: { create: prisma.booking.create } }),
  );

  const eventsGateway = { emitBookingCreated: jest.fn() };

  const stripeService = {
    createBookingPaymentIntent: jest.fn().mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret_abc',
    }),
    getPaymentIntentStatus: jest.fn(),
  };

  const service = new BookingsService(
    prisma as any,
    eventsGateway as any,
    stripeService as any,
  );

  return { service, prisma, eventsGateway, stripeService };
}

describe('BookingsService.create — payment flow', () => {
  it('creates a PaymentIntent and returns clientSecret when the manager is onboarded', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.create.mockResolvedValue({
      id: 'booking-1',
      amountCents: 1000,
    });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-1',
      amountCents: 1000,
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_123',
    });

    const result = await service.create(
      {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        startTime: FUTURE_START,
        endTime: FUTURE_END,
      },
      'space-1',
      'user-1',
    );

    expect(stripeService.createBookingPaymentIntent).toHaveBeenCalledWith({
      amountCents: 1000,
      connectedAccountId: 'acct_123',
      bookingId: 'booking-1',
    });
    expect(result.clientSecret).toBe('pi_123_secret_abc');
    expect(result.paymentStatus).toBe('PENDING');
  });

  it('does NOT create a PaymentIntent when the manager has not completed onboarding — booking stays UNPAID, clientSecret is null', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.user.findFirst.mockResolvedValue({
      id: 'manager-1',
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });
    prisma.booking.create.mockResolvedValue({
      id: 'booking-2',
      amountCents: 1000,
      paymentStatus: 'UNPAID',
    });

    const result = await service.create(
      {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        startTime: FUTURE_START,
        endTime: FUTURE_END,
      },
      'space-1',
      'user-1',
    );

    expect(stripeService.createBookingPaymentIntent).not.toHaveBeenCalled();
    expect(result.clientSecret).toBeNull();
    expect(result.paymentStatus).toBe('UNPAID');
  });

  it('deletes the booking and throws Conflict when PaymentIntent creation fails (no orphaned unpayable booking)', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.create.mockResolvedValue({ id: 'booking-3', amountCents: 1000 });
    stripeService.createBookingPaymentIntent.mockRejectedValue(
      new Error('Stripe is down'),
    );

    await expect(
      service.create(
        {
          bookableType: BookableType.DESK,
          bookableId: 'desk-1',
          startTime: FUTURE_START,
          endTime: FUTURE_END,
        },
        'space-1',
        'user-1',
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.booking.delete).toHaveBeenCalledWith({
      where: { id: 'booking-3' },
    });
  });

  it('clears any abandoned hold on this exact resource before attempting to create the new booking', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.create.mockResolvedValue({ id: 'booking-5', amountCents: 1000 });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-5',
      amountCents: 1000,
      paymentStatus: 'PENDING',
    });

    await service.create(
      {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        startTime: FUTURE_START,
        endTime: FUTURE_END,
      },
      'space-1',
      'user-1',
    );

    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        paymentStatus: { in: ['PENDING', 'FAILED'] },
        holdExpiresAt: { lt: expect.any(Date) },
      },
    });
  });

  it('sets holdExpiresAt roughly 15 minutes in the future when creating a PaymentIntent', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.create.mockResolvedValue({ id: 'booking-6', amountCents: 1000 });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-6',
      amountCents: 1000,
      paymentStatus: 'PENDING',
    });

    const before = Date.now();
    await service.create(
      {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        startTime: FUTURE_START,
        endTime: FUTURE_END,
      },
      'space-1',
      'user-1',
    );
    const after = Date.now();

    const updateCall = prisma.booking.update.mock.calls[0][0];
    const holdExpiresAt: Date = updateCall.data.holdExpiresAt;

    expect(holdExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
    expect(holdExpiresAt.getTime()).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
  });

  it('broadcasts booking_created with the real booking (not clientSecret leaked into the room)', async () => {
    const { service, prisma, eventsGateway } = buildDeps();
    prisma.booking.create.mockResolvedValue({ id: 'booking-4', amountCents: 1000 });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-4',
      amountCents: 1000,
      paymentStatus: 'PENDING',
    });

    await service.create(
      {
        bookableType: BookableType.DESK,
        bookableId: 'desk-1',
        startTime: FUTURE_START,
        endTime: FUTURE_END,
      },
      'space-1',
      'user-1',
    );

    expect(eventsGateway.emitBookingCreated).toHaveBeenCalledWith(
      'space-1',
      expect.objectContaining({ id: 'booking-4' }),
    );
    const broadcastArg = eventsGateway.emitBookingCreated.mock.calls[0][1];
    expect(broadcastArg.clientSecret).toBeUndefined();
  });
});

describe('BookingsService.findAllForSpace — payment reconciliation', () => {
  it('leaves PAID/FAILED/UNPAID bookings untouched — no Stripe calls for them', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PAID', stripePaymentIntentId: 'pi_1' },
      { id: 'b2', paymentStatus: 'UNPAID', stripePaymentIntentId: null },
      { id: 'b3', paymentStatus: 'FAILED', stripePaymentIntentId: 'pi_3' },
    ]);

    const result = await service.findAllForSpace('space-1');

    expect(stripeService.getPaymentIntentStatus).not.toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('flips a PENDING booking to PAID when Stripe reports the PaymentIntent succeeded — self-heals a booking stuck PENDING because the webhook never arrived', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_1' },
    ]);
    stripeService.getPaymentIntentStatus.mockResolvedValue({
      status: 'succeeded',
      hasFailedAttempt: false,
    });

    const result = await service.findAllForSpace('space-1');

    expect(result[0].paymentStatus).toBe('PAID');
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { paymentStatus: 'PAID', holdExpiresAt: null },
    });
  });

  it('flips a PENDING booking to FAILED after a declined card (requires_payment_method + hasFailedAttempt)', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_1' },
    ]);
    stripeService.getPaymentIntentStatus.mockResolvedValue({
      status: 'requires_payment_method',
      hasFailedAttempt: true,
    });

    const result = await service.findAllForSpace('space-1');

    expect(result[0].paymentStatus).toBe('FAILED');
  });

  it('does NOT flip a fresh, never-attempted PaymentIntent to FAILED just because it is requires_payment_method (that is the normal starting status)', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_1' },
    ]);
    stripeService.getPaymentIntentStatus.mockResolvedValue({
      status: 'requires_payment_method',
      hasFailedAttempt: false,
    });

    const result = await service.findAllForSpace('space-1');

    expect(result[0].paymentStatus).toBe('PENDING');
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('leaves genuinely in-progress statuses (requires_action, processing) as PENDING', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_1' },
      { id: 'b2', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_2' },
    ]);
    stripeService.getPaymentIntentStatus
      .mockResolvedValueOnce({ status: 'requires_action', hasFailedAttempt: false })
      .mockResolvedValueOnce({ status: 'processing', hasFailedAttempt: false });

    const result = await service.findAllForSpace('space-1');

    expect(result.map((b) => b.paymentStatus)).toEqual(['PENDING', 'PENDING']);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('does not let one failed Stripe lookup break the rest of the list', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_1' },
      { id: 'b2', paymentStatus: 'PENDING', stripePaymentIntentId: 'pi_2' },
    ]);
    stripeService.getPaymentIntentStatus
      .mockRejectedValueOnce(new Error('Stripe API down'))
      .mockResolvedValueOnce({ status: 'succeeded', hasFailedAttempt: false });

    const result = await service.findAllForSpace('space-1');

    expect(result.find((b) => b.id === 'b1')?.paymentStatus).toBe('PENDING');
    expect(result.find((b) => b.id === 'b2')?.paymentStatus).toBe('PAID');
  });

  it('deletes and excludes a PENDING booking whose hold has expired — frees the slot for others', async () => {
    const { service, prisma } = buildDeps();
    const expiredAt = new Date(Date.now() - 60 * 1000);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'b1',
        paymentStatus: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        holdExpiresAt: expiredAt,
      },
    ]);

    const result = await service.findAllForSpace('space-1');

    expect(result).toHaveLength(0);
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1'] } },
    });
  });

  it('deletes and excludes a FAILED booking whose hold has expired', async () => {
    const { service, prisma } = buildDeps();
    const expiredAt = new Date(Date.now() - 60 * 1000);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'b1',
        paymentStatus: 'FAILED',
        stripePaymentIntentId: 'pi_1',
        holdExpiresAt: expiredAt,
      },
    ]);

    const result = await service.findAllForSpace('space-1');

    expect(result).toHaveLength(0);
  });

  it('keeps a PENDING booking whose hold has NOT expired yet', async () => {
    const { service, prisma, stripeService } = buildDeps();
    const notYetExpired = new Date(Date.now() + 5 * 60 * 1000);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'b1',
        paymentStatus: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        holdExpiresAt: notYetExpired,
      },
    ]);
    stripeService.getPaymentIntentStatus.mockResolvedValue({
      status: 'requires_payment_method',
      hasFailedAttempt: false,
    });

    const result = await service.findAllForSpace('space-1');

    expect(result).toHaveLength(1);
    expect(prisma.booking.deleteMany).not.toHaveBeenCalled();
  });

  it('never expires a PAID or UNPAID booking regardless of holdExpiresAt (those are not holds)', async () => {
    const { service, prisma } = buildDeps();
    const longExpired = new Date(Date.now() - 999 * 60 * 1000);
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', paymentStatus: 'PAID', stripePaymentIntentId: 'pi_1', holdExpiresAt: null },
      { id: 'b2', paymentStatus: 'UNPAID', stripePaymentIntentId: null, holdExpiresAt: longExpired },
    ]);

    const result = await service.findAllForSpace('space-1');

    expect(result).toHaveLength(2);
    expect(prisma.booking.deleteMany).not.toHaveBeenCalled();
  });
});

describe('BookingsService.retryPayment', () => {
  it('deletes the booking and rejects when the FAILED booking\'s hold already expired — does not resurrect it with a fresh PaymentIntent', async () => {
    const { service, prisma, stripeService } = buildDeps();
    const expiredAt = new Date(Date.now() - 60 * 1000); // 1 minute ago
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'FAILED',
      amountCents: 1000,
      holdExpiresAt: expiredAt,
    });

    await expect(
      service.retryPayment('booking-1', 'space-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.booking.delete).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
    });
    expect(stripeService.createBookingPaymentIntent).not.toHaveBeenCalled();
  });

  it('allows retrying a FAILED booking whose hold has NOT expired yet', async () => {
    const { service, prisma, stripeService } = buildDeps();
    const notYetExpired = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'FAILED',
      amountCents: 1000,
      holdExpiresAt: notYetExpired,
    });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-1',
      paymentStatus: 'PENDING',
    });

    const result = await service.retryPayment('booking-1', 'space-1', 'user-1');

    expect(prisma.booking.delete).not.toHaveBeenCalled();
    expect(stripeService.createBookingPaymentIntent).toHaveBeenCalled();
    expect(result.clientSecret).toBeDefined();
  });

  it('rejects retrying payment on a booking that belongs to a different user', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'someone-else',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'FAILED',
      amountCents: 1000,
    });

    await expect(
      service.retryPayment('booking-1', 'space-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException for a booking id that does not exist', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      service.retryPayment('missing', 'space-1', 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects retrying a booking that is already PAID', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'PAID',
      amountCents: 1000,
    });

    await expect(
      service.retryPayment('booking-1', 'space-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects retrying a booking that is already PENDING (avoids a second PaymentIntent)', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'PENDING',
      amountCents: 1000,
    });

    await expect(
      service.retryPayment('booking-1', 'space-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(stripeService.createBookingPaymentIntent).not.toHaveBeenCalled();
  });

  it('rejects when the space manager has not completed Stripe onboarding', async () => {
    const { service, prisma } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'FAILED',
      amountCents: 1000,
    });
    prisma.user.findFirst.mockResolvedValue({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
    });

    await expect(
      service.retryPayment('booking-1', 'space-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a fresh PaymentIntent and returns a clientSecret for a FAILED booking', async () => {
    const { service, prisma, stripeService } = buildDeps();
    prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      userId: 'user-1',
      bookableType: BookableType.DESK,
      bookableId: 'desk-1',
      paymentStatus: 'FAILED',
      amountCents: 1000,
    });
    prisma.booking.update.mockResolvedValue({
      id: 'booking-1',
      paymentStatus: 'PENDING',
      stripePaymentIntentId: 'pi_456',
    });
    stripeService.createBookingPaymentIntent.mockResolvedValue({
      id: 'pi_456',
      client_secret: 'pi_456_secret_xyz',
    });

    const result = await service.retryPayment('booking-1', 'space-1', 'user-1');

    expect(stripeService.createBookingPaymentIntent).toHaveBeenCalledWith({
      amountCents: 1000,
      connectedAccountId: 'acct_123',
      bookingId: 'booking-1',
    });
    expect(result.clientSecret).toBe('pi_456_secret_xyz');
  });
});
