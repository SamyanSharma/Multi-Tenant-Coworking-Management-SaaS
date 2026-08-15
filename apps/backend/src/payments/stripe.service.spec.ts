import { BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';

describe('StripeService.calculateFeeSplit', () => {
  let service: StripeService;

  beforeAll(() => {
    // StripeService's constructor requires a TEST MODE secret key to
    // exist (fails loudly otherwise, by design — see stripe.service.ts).
    // A fake-but-correctly-shaped test key is enough to construct the
    // service for testing calculateFeeSplit, which is pure arithmetic
    // and never actually calls Stripe's API.
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
    // 101 cents * 5% = 5.05 -> rounds to 5. This is the case that would
    // break if platformFee and managerAmount were rounded independently
    // instead of managerAmount being derived by subtraction.
    const amount = 101;
    const { platformFeeCents, managerAmountCents } =
      service.calculateFeeSplit(amount);
    expect(platformFeeCents + managerAmountCents).toBe(amount);
  });

  it('handles a small amount without going negative or losing cents', () => {
    const amount = 3; // 3 cents * 5% = 0.15 -> rounds to 0
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

  // Sweeps a range of realistic booking amounts ($1 to $500) to confirm
  // the split always sums back exactly, rather than trusting the three
  // hand-picked cases above to represent every rounding edge case.
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
