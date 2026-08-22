import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

// Platform's cut of every booking payment (5%).
const PLATFORM_FEE_PERCENT = 5;

// Stripe Accounts v2 preview API version.
const STRIPE_ACCOUNTS_V2_API_VERSION = '2026-01-28.preview';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not set. Use a TEST MODE secret key (starts ' +
          'with sk_test_) from your Stripe dashboard — see .env.example.',
      );
    }

    if (!secretKey.startsWith('sk_test_')) {
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
   * Splits a booking payment into:
   * - 5% platform fee
   * - 95% Space_Manager amount
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

    const managerAmountCents =
      amountCents - platformFeeCents;

    return {
      platformFeeCents,
      managerAmountCents,
    };
  }

  /**
   * Creates a Stripe PaymentIntent for a booking.
   *
   * Full amount:
   * - 5% platform application fee
   * - 95% transferred to the Space_Manager
   *
   * Card is the only payment method for this MVP.
   */
  async createBookingPaymentIntent(params: {
    amountCents: number;
    connectedAccountId: string;
    bookingId: string;
  }): Promise<Stripe.PaymentIntent> {
    const {
      amountCents,
      connectedAccountId,
      bookingId,
    } = params;

    const { platformFeeCents } =
      this.calculateFeeSplit(amountCents);

    return this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',

      application_fee_amount: platformFeeCents,

      transfer_data: {
        destination: connectedAccountId,
      },

      metadata: {
        bookingId,
      },

      payment_method_types: ['card'],
    });
  }

  /**
   * Verifies a Stripe webhook payload's signature.
   */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not set. Get this from `stripe listen` ' +
          '(local dev) or your Stripe dashboard webhook config (deployed).',
      );
    }

    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }

  /**
   * Ensures a Stripe Connect account exists for the
   * Space_Manager.
   *
   * Existing account IDs are reused.
   *
   * New accounts are created through Stripe Accounts v2.
   */
  async createOrGetConnectAccount(user: {
    id: string;
    email: string;
    stripeAccountId: string | null;
  }): Promise<string> {
    // Reuse an existing connected account.
    if (user.stripeAccountId) {
      return user.stripeAccountId;
    }

    /**
     * Accounts v2 requires the account identity country
     * before merchant configuration can be supplied.
     *
     * This capstone currently uses USD and Stripe test mode,
     * so the demo manager account is created as a US account.
     */
    const response = await this.stripe.rawRequest(
      'POST',
      '/v2/core/accounts',
      {
        contact_email: user.email,

        display_name: user.email,

        dashboard: 'express',

        identity: {
          country: 'us',
        },

        configuration: {
          merchant: {
            capabilities: {
              card_payments: {
                requested: true,
              },
            },
          },
        },

        defaults: {
          responsibilities: {
            losses_collector: 'application',
            fees_collector: 'application',
          },
        },

        metadata: {
          userId: user.id,
        },
      },
      {
        apiVersion: STRIPE_ACCOUNTS_V2_API_VERSION,
      },
    );

    /**
     * rawRequest's TypeScript definition does not expose
     * the Accounts v2 response shape, so narrow it locally.
     */
    const accountResponse = response as unknown as {
      id?: string;
    };

    const accountId = accountResponse.id;

    if (!accountId) {
      throw new Error(
        'Stripe Accounts v2 did not return an account id.',
      );
    }

    return accountId;
  }

  /**
   * Generates a hosted Stripe Connect onboarding link.
   */
  async createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link =
      await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

    return link.url;
  }
}