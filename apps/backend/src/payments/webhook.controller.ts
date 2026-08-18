import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
  HttpCode,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkipTenantCheck } from '../auth/skip-tenant-check.decorator';

@Controller('payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Stripe's servers call this directly — they will never send an
   * x-space-id or x-user-role header, so this route MUST be exempt from
   * the global TenantGuard/RbacGuard. Skipping those guards here is safe
   * specifically BECAUSE Stripe signature verification (below) is a
   * stronger authenticity check than either header ever was: it proves
   * the request body was signed by Stripe's private key, not just that
   * some caller sent a plausible-looking header.
   */
  @SkipTenantCheck()
  @HttpCode(200)
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      // This means main.ts's `rawBody: true` NestFactory option isn't
      // active, or something upstream (a proxy, a different body parser)
      // consumed the body first. Signature verification is IMPOSSIBLE
      // without the exact raw bytes Stripe signed — failing loudly here
      // is much better than silently trusting an unverified payload.
      throw new BadRequestException(
        'Raw request body unavailable — cannot verify webhook signature',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(
        req.rawBody,
        signature,
      );
    } catch (err: unknown) {
      // A failed signature verification means either (a) this isn't
      // really from Stripe, or (b) STRIPE_WEBHOOK_SECRET is misconfigured
      // — both cases should reject the request, never process the
      // payload anyway "just in case."
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException(
        `Webhook signature verification failed: ${message}`,
      );
    }

    // Only handling the one event type actually needed for Stage 6's
    // scope (confirming a booking payment succeeded). Stripe sends many
    // other event types to any registered webhook endpoint; explicitly
    // ignoring the rest (rather than a catch-all handler) makes it clear
    // exactly what this system currently reacts to.
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.bookingId;

        if (!bookingId) {
          this.logger.warn(
            `payment_intent.succeeded (${paymentIntent.id}) has no ` +
              'bookingId in metadata — cannot link it to a Booking row',
          );
          break;
        }

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'PAID',
            stripePaymentIntentId: paymentIntent.id,
          },
        });
        this.logger.log(`Booking ${bookingId} marked PAID`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.bookingId;
        if (bookingId) {
          await this.prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: 'FAILED' },
          });
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const userId = account.metadata?.userId;

        if (!userId) {
          this.logger.warn(
            `account.updated (${account.id}) has no userId in metadata`,
          );
          break;
        }

        // Onboarding is "complete" specifically when Stripe confirms the
        // account can both receive charges and has submitted all
        // required KYC details — checking only one of the two would let
        // a partially-onboarded account be treated as ready, and a
        // transfer to it would then fail at charge time instead of here.
        const isComplete = Boolean(
          account.charges_enabled && account.details_submitted,
        );

        await this.prisma.user.update({
          where: { id: userId },
          data: { stripeOnboardingComplete: isComplete },
        });
        this.logger.log(
          `User ${userId} stripeOnboardingComplete=${isComplete}`,
        );
        break;
      }

      default:
        // Deliberately silent for event types this system doesn't act
        // on yet — still returns 200 below so Stripe doesn't retry.
        this.logger.debug(`Ignoring unhandled event type: ${event.type}`);
    }

    // Stripe expects a fast 2xx to acknowledge receipt; it retries with
    // backoff on anything else, which would otherwise cause duplicate
    // processing if this handler is slow rather than actually failing.
    return { received: true };
  }
}
