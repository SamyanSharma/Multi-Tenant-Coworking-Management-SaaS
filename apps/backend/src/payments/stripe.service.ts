import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

const PLATFORM_FEE_PERCENT = 5;

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

  async createOrGetConnectAccount(user: {
    id: string;
    email: string;
    stripeAccountId: string | null;
  }): Promise<string> {
    if (user.stripeAccountId) {
      // Patches accounts created before the recipient capability fix
      // below existed (like any account created prior to this
      // change) — safe to call every time: Stripe treats re-
      // requesting an already-granted capability as a no-op.
      await this.ensureRecipientCapability(user.stripeAccountId);
      return user.stripeAccountId;
    }

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
          // merchant.card_payments: lets this account be the
          // customer-facing merchant for a card charge.
          merchant: {
            capabilities: {
              card_payments: {
                requested: true,
              },
            },
          },

          // recipient.stripe_balance.stripe_transfers: lets this
          // account actually RECEIVE the transfer_data.destination
          // transfer that createBookingPaymentIntent() sends it.
          // Without this, every PaymentIntent creation fails with
          // "Your destination account needs to have at least one of
          // the following capabilities enabled: transfers..." —
          // merchant alone only covers charging a card, not being the
          // destination of a transfer.
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  requested: true,
                },
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

  private async ensureRecipientCapability(
    accountId: string,
  ): Promise<void> {
    await this.stripe.rawRequest(
      'POST',
      `/v2/core/accounts/${accountId}`,
      {
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  requested: true,
                },
              },
            },
          },
        },
      },
      {
        apiVersion: STRIPE_ACCOUNTS_V2_API_VERSION,
      },
    );
  }

 
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

  // Same shape of account data the account.updated webhook receives
  // (Stripe.Account, extended with the v2-preview fields this app's
  // Accounts v2 accounts actually carry) — used by both the webhook
  // handler and getAccountStatus() below so the two can never
  // disagree about what "onboarding complete" means.
  static computeOnboardingStatus(
    account: Stripe.Account & {
      requirements?: {
        currently_due?: string[] | null;
        past_due?: string[] | null;
        disabled_reason?: string | null;
      } | null;
      applied_configurations?: string[] | null;
    },
  ): {
    isComplete: boolean;
    currentlyDue: string[];
    pastDue: string[];
    disabledReason: string | null;
  } {
    const currentlyDue = account.requirements?.currently_due ?? [];
    const pastDue = account.requirements?.past_due ?? [];
    const disabledReason = account.requirements?.disabled_reason ?? null;

    const traditionalAccountComplete = Boolean(
      account.charges_enabled && account.details_submitted,
    );

    const v2AccountComplete =
      Array.isArray(account.applied_configurations) &&
      account.applied_configurations.includes('merchant') &&
      account.applied_configurations.includes('recipient') &&
      currentlyDue.length === 0 &&
      pastDue.length === 0 &&
      disabledReason === null;

    return {
      isComplete: traditionalAccountComplete || v2AccountComplete,
      currentlyDue,
      pastDue,
      disabledReason,
    };
  }

  // Actively asks Stripe for this account's current state, rather
  // than only trusting the account.updated webhook. This matters
  // because in local dev, that webhook simply never arrives unless
  // `stripe listen --forward-to localhost:3000/payments/webhook` is
  // running — completing onboarding in the browser would otherwise
  // leave stripeOnboardingComplete permanently stuck at false with no
  // way to self-correct.
  async getAccountStatus(accountId: string) {
    const response = await this.stripe.rawRequest(
      'GET',
      `/v2/core/accounts/${accountId}`,
      {},
      { apiVersion: STRIPE_ACCOUNTS_V2_API_VERSION },
    );

    return StripeService.computeOnboardingStatus(
      response as unknown as Stripe.Account,
    );
  }

  // Actively checks a PaymentIntent's real status, the same way
  // getAccountStatus() does for onboarding — used by
  // bookings.service.ts to self-heal bookings stuck at PENDING
  // because payment_intent.succeeded/failed never arrived (e.g.
  // `stripe listen` wasn't running yet when the payment was
  // confirmed). hasFailedAttempt distinguishes a genuinely fresh
  // PaymentIntent (status requires_payment_method, never attempted)
  // from one that reverted to requires_payment_method after a
  // decline — only the latter should be treated as FAILED.
  // Stage 9: full refund of a booking's payment, used when a Space Manager
  // deletes a desk/room/zone (or space) that has a paid, upcoming booking.
  //
  // The charge is a DESTINATION charge (transfer_data.destination +
  // application_fee_amount), so a refund needs two extra flags or the money
  // would come out of the PLATFORM's balance only:
  //   reverse_transfer: true        -> pull the manager's 95% share back
  //   refund_application_fee: true  -> give the platform's 5% back too
  // The customer therefore gets 100% back, funded by the two parties that
  // received it. (Stripe's own processing fee is not returned.)
  //
  // The idempotency key makes this safe to call again after a timeout or a
  // crash: Stripe returns the SAME refund instead of refunding twice.
  async refundBookingPayment(
    paymentIntentId: string,
    bookingId: string,
  ): Promise<{ id: string; status: string; amount: number }> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { bookingId },
      },
      { idempotencyKey: `refund-${bookingId}` },
    );

    return {
      id: refund.id,
      status: refund.status ?? 'unknown',
      amount: refund.amount,
    };
  }

  // Stage 9: stop a member from paying for a booking that was just cancelled.
  // Never throws for "already in a final state" -- it reports the state so
  // the caller can decide (a PaymentIntent that already SUCCEEDED must be
  // refunded, not cancelled).
  async cancelPaymentIntent(
    paymentIntentId: string,
  ): Promise<'canceled' | 'succeeded' | 'other'> {
    try {
      const intent =
        await this.stripe.paymentIntents.cancel(paymentIntentId);
      return intent.status === 'canceled' ? 'canceled' : 'other';
    } catch (err) {
      // Cancel fails if the intent already left a cancellable state
      // (e.g. the member paid a moment ago). Look at where it ended up.
      const intent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);

      if (intent.status === 'canceled') return 'canceled';
      if (intent.status === 'succeeded') return 'succeeded';

      throw err;
    }
  }

  async getPaymentIntentStatus(paymentIntentId: string): Promise<{
    status: Stripe.PaymentIntent.Status;
    hasFailedAttempt: boolean;
  }> {
    const intent =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      status: intent.status,
      hasFailedAttempt: Boolean(intent.last_payment_error),
    };
  }
}