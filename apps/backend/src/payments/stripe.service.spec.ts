import { BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';

describe('StripeService.calculateFeeSplit', () => {
  let service: StripeService;

  beforeAll(() => {
   
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit_test_placeholder_key';
    service = new StripeService();
  });

  it('splits a round amount into exactly 95/5', () => {
    const { platformFeeCents, managerAmountCents } =
      service.calculateFeeSplit(10000); // $100.00
    expect(platformFeeCents).toBe(500); // $5.00
    expect(managerAmountCents).toBe(9500); // $95.00
  });

  it('always sums back to the original amount, even with rounding', () => {
    const amount = 101;
    const { platformFeeCents, managerAmountCents } =
      service.calculateFeeSplit(amount);
    expect(platformFeeCents + managerAmountCents).toBe(amount);
  });

  it('handles a small amount without going negative or losing cents', () => {
    const amount = 3;
    const { platformFeeCents, managerAmountCents } =
      service.calculateFeeSplit(amount);
    expect(platformFeeCents).toBe(0);
    expect(managerAmountCents).toBe(3);
    expect(platformFeeCents + managerAmountCents).toBe(amount);
  });

  it('rejects a zero amount', () => {
    expect(() => service.calculateFeeSplit(0)).toThrow(BadRequestException);
  });

  it('rejects a negative amount', () => {
    expect(() => service.calculateFeeSplit(-500)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-integer amount (fractional cents are not valid)', () => {
    expect(() => service.calculateFeeSplit(100.5)).toThrow(
      BadRequestException,
    );
  });

  it('sums back exactly for a wide sweep of amounts', () => {
    for (let amountCents = 100; amountCents <= 50000; amountCents += 137) {
      const { platformFeeCents, managerAmountCents } =
        service.calculateFeeSplit(amountCents);
      expect(platformFeeCents + managerAmountCents).toBe(amountCents);
      expect(platformFeeCents).toBeGreaterThanOrEqual(0);
      expect(managerAmountCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('StripeService constructor safety', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it('refuses to start with no STRIPE_SECRET_KEY set', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => new StripeService()).toThrow();
  });

  it('refuses to start with a LIVE key (not sk_test_) — TEST MODE ONLY per PRD.md', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_this_should_be_rejected';
    expect(() => new StripeService()).toThrow();
  });
});

describe('StripeService.computeOnboardingStatus', () => {
  function account(overrides: Record<string, unknown> = {}) {
    return {
      charges_enabled: false,
      details_submitted: false,
      requirements: null,
      applied_configurations: null,
      ...overrides,
    } as any;
  }

  it('is complete via the traditional (v1) path: charges_enabled + details_submitted', () => {
    const result = StripeService.computeOnboardingStatus(
      account({ charges_enabled: true, details_submitted: true }),
    );
    expect(result.isComplete).toBe(true);
  });

  it('is NOT complete when only one of charges_enabled/details_submitted is true', () => {
    expect(
      StripeService.computeOnboardingStatus(
        account({ charges_enabled: true, details_submitted: false }),
      ).isComplete,
    ).toBe(false);

    expect(
      StripeService.computeOnboardingStatus(
        account({ charges_enabled: false, details_submitted: true }),
      ).isComplete,
    ).toBe(false);
  });

  it('is complete via the v2 path: merchant configuration applied with no outstanding requirements', () => {
    const result = StripeService.computeOnboardingStatus(
      account({
        applied_configurations: ['merchant'],
        requirements: {
          currently_due: [],
          past_due: [],
          disabled_reason: null,
        },
      }),
    );
    expect(result.isComplete).toBe(true);
  });

  it('is NOT complete via the v2 path when currently_due is non-empty', () => {
    const result = StripeService.computeOnboardingStatus(
      account({
        applied_configurations: ['merchant'],
        requirements: {
          currently_due: ['individual.verification.document'],
          past_due: [],
          disabled_reason: null,
        },
      }),
    );
    expect(result.isComplete).toBe(false);
    expect(result.currentlyDue).toEqual([
      'individual.verification.document',
    ]);
  });

  it('is NOT complete via the v2 path when disabled_reason is set', () => {
    const result = StripeService.computeOnboardingStatus(
      account({
        applied_configurations: ['merchant'],
        requirements: {
          currently_due: [],
          past_due: [],
          disabled_reason: 'requirements.pending_verification',
        },
      }),
    );
    expect(result.isComplete).toBe(false);
    expect(result.disabledReason).toBe('requirements.pending_verification');
  });

  it('is NOT complete when applied_configurations does not include "merchant"', () => {
    const result = StripeService.computeOnboardingStatus(
      account({
        applied_configurations: ['recipient'],
        requirements: {
          currently_due: [],
          past_due: [],
          disabled_reason: null,
        },
      }),
    );
    expect(result.isComplete).toBe(false);
  });

  it('defaults currentlyDue/pastDue to empty arrays and disabledReason to null when requirements is missing entirely', () => {
    const result = StripeService.computeOnboardingStatus(account());
    expect(result.currentlyDue).toEqual([]);
    expect(result.pastDue).toEqual([]);
    expect(result.disabledReason).toBeNull();
    expect(result.isComplete).toBe(false);
  });
});

describe('StripeService.getAccountStatus', () => {
  it('calls the v2 accounts GET endpoint and applies computeOnboardingStatus to the response', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit_test_placeholder_key';
    const service = new StripeService();

    const rawRequest = jest.fn().mockResolvedValue({
      charges_enabled: true,
      details_submitted: true,
    });
    // `stripe` is a plain private property (not a getter/setter), so
    // it's replaced directly rather than via jest.spyOn's accessor form.
    (service as any).stripe = { rawRequest };

    const result = await service.getAccountStatus('acct_123');

    expect(rawRequest).toHaveBeenCalledWith(
      'GET',
      '/v2/core/accounts/acct_123',
      {},
      expect.objectContaining({ apiVersion: expect.any(String) }),
    );
    expect(result.isComplete).toBe(true);
  });
});
