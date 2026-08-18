import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

// Platform's cut of every booking payment (5%), per PRD.md's "95%
// Space_Manager / 5% platform" split. Kept as a named constant, not
// scattered magic numbers, since this value has real financial meaning
// and any future change to it should be a one-line, greppable diff.
const PLATFORM_FEE_PERCENT = 5;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // Fail loudly at startup, not on the first real payment attempt —
      // same "compile-clean but silently broken at runtime" trap flagged
      // in PROGRESS.md's Stage 1-4 gotchas (Prisma driver adapter,
      // dotenv). A missing Stripe key should never surface as a mystery
      // 500 mid-checkout.
      throw new Error(
        'STRIPE_SECRET_KEY is not set. Use a TEST MODE secret key (starts ' +
          'with sk_test_) from your Stripe dashboard — see .env.example.',
      );
    }
    if (!secretKey.startsWith('sk_test_')) {
      // Belt-and-suspenders per the task doc's explicit "TEST MODE ONLY"
      // instruction — a live key here would move real money.
      this.logger.warn(
        'STRIPE_SECRET_KEY does not look like a TEST MODE key (expected ' +
          'sk_test_...). Refusing to silently proceed with what could be ' +
          'a live key in a capstone/demo project.',
      );
      throw new Error(
        'Refusing to start with a non-test Stripe secret key. This project ' +
          'is TEST MODE ONLY per PRD.md — use an sk_test_ key.',
      );
    }

    this.stripe = new Stripe(secretKey);
  }

  /**
   * Splits a total charge (in cents, to avoid floating-point rounding
   * errors — Stripe's own API works in cents for this reason too) into
   * the platform's 5% and the Space_Manager's 95%.
   *
   * Uses Math.round + subtraction (not two independent rounds) so the
   * two halves always sum back to exactly amountCents — two independent
   * roundings can drift by a cent on certain inputs (e.g. amountCents=101
   * -> 5%=5.05 rounds to 5, 95%=95.95 rounds to 96, sums to 101, fine;
   * but amountCents=3 -> 5%=0.15 rounds to 0, 95%=2.85 rounds to 3, still
   * fine here, though relying on two independent rounds to always agree
   * is not guaranteed in general — computing one and subtracting is the
   * safe pattern).
   */
  calculateFeeSplit(amountCents: number): {
    platformFeeCents: number;
    managerAmountCents: number;
  } {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException(
        'amountCents must be a positive integer (cents, not dollars)',
      );
    }
    const platformFeeCents = Math.round(
      (amountCents * PLATFORM_FEE_PERCENT) / 100,
    );
    const managerAmountCents = amountCents - platformFeeCents;
    return { platformFeeCents, managerAmountCents };
  }

  /**
   * Creates a Stripe PaymentIntent using the "destination charge" pattern:
   * the full amount is charged on the PLATFORM's Stripe account, and
   * Stripe automatically transfers `managerAmountCents` to the
   * Space_Manager's connected account, keeping `platformFeeCents` on the
   * platform account — the 95/5 split happens atomically as part of the
   * charge itself, not as a manual follow-up transfer (which would be a
   * separate, unsynchronized operation that could fail independently).
   */
  async createBookingPaymentIntent(params: {
    amountCents: number;
    connectedAccountId: string;
    bookingId: string;
  }): Promise<Stripe.PaymentIntent> {
    const { amountCents, connectedAccountId, bookingId } = params;
    const { platformFeeCents } = this.calculateFeeSplit(amountCents);

    return this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: connectedAccountId,
      },
      // Lets the webhook handler find the Booking row again without a
      // separate lookup table — Stripe echoes metadata back on every
      // event related to this PaymentIntent.
      metadata: { bookingId },
    });
  }

  /**
   * Verifies a webhook payload's signature and parses it into a real
   * Stripe.Event. MUST be called with the exact raw (unparsed) request
   * body — Stripe signs the raw bytes, so if NestJS's default JSON body
   * parser has already touched the body, the signature will never match
   * even for a genuine request. See main.ts's `rawBody: true` and
   * webhook.controller.ts for how the raw body is preserved.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not set. Get this from `stripe listen` ' +
          '(local dev) or your Stripe dashboard webhook config (deployed).',
      );
    }
    // Throws Stripe.errors.StripeSignatureVerificationError on a bad/
    // forged signature — deliberately NOT caught here, so a bad signature
    // fails loudly to the caller (webhook.controller.ts) rather than this
    // method silently returning something unverified.
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }

  /**
   * Ensures a Stripe Connect account exists for this Space_Manager,
   * creating one if needed, and returns its id. Idempotent: if
   * `user.stripeAccountId` is already set, returns it directly rather
   * than creating a duplicate account on every call.
   *
   * Uses Express accounts (Stripe-hosted onboarding UI, minimal
   * platform-side compliance burden) — the right default for a capstone
   * demo over Custom accounts, which require building your own
   * onboarding UI and taking on more compliance responsibility.
   */
  async createOrGetConnectAccount(user: {
    id: string;
    email: string;
    stripeAccountId: string | null;
  }): Promise<string> {
    if (user.stripeAccountId) {
      return user.stripeAccountId;
    }

    const account = await this.stripe.accounts.create({
      type: 'express',
      email: user.email,
      // Lets the account.updated webhook find the right User row without
      // a separate lookup table — same metadata pattern used for Booking
      // in createBookingPaymentIntent.
      metadata: { userId: user.id },
    });

    return account.id;
  }

  /**
   * Generates a one-time-use hosted onboarding URL for a given Connect
   * account. The Space_Manager is redirected here to enter their bank
   * details; Stripe handles the entire compliance/KYC flow, and this
   * platform never sees or stores raw banking info.
   *
   * refreshUrl: where Stripe sends the user if the link expires or they
   * need to restart. returnUrl: where Stripe sends them after completing
   * (or abandoning) the flow — completion itself is NOT confirmed by
   * landing on returnUrl; that's only confirmed by the account.updated
   * webhook (see webhook.controller.ts), since the user could close the
   * tab mid-flow and still "return."
   */
  async createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }
}
