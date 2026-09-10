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
import { Public } from '../auth/public.decorator';

@Controller('payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  // Public: Stripe calls this directly with no JWT. Its
  // stripe-signature header (verified below) is the actual auth
  // mechanism here, not anything JwtAuthGuard checks.
  @Public()
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
      const message = err instanceof Error ? err.message : 'unknown error';

      this.logger.warn(
        `Webhook signature verification failed: ${message}`,
      );

      throw new BadRequestException(
        `Webhook signature verification failed: ${message}`,
      );
    }

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
            data: {
              paymentStatus: 'FAILED',
            },
          });

          this.logger.log(`Booking ${bookingId} marked FAILED`);
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

       

        const accountData = account as Stripe.Account & {
          requirements?: {
            currently_due?: string[] | null;
            past_due?: string[] | null;
            disabled_reason?: string | null;
          } | null;

          applied_configurations?: string[] | null;

          capabilities?: {
            card_payments?: string;
          };
        };

        const currentlyDue =
          accountData.requirements?.currently_due ?? [];

        const pastDue =
          accountData.requirements?.past_due ?? [];

        const disabledReason =
          accountData.requirements?.disabled_reason ?? null;

        const traditionalAccountComplete = Boolean(
          account.charges_enabled &&
            account.details_submitted,
        );

        const v2AccountComplete =
          Array.isArray(accountData.applied_configurations) &&
          accountData.applied_configurations.includes('merchant') &&
          currentlyDue.length === 0 &&
          pastDue.length === 0 &&
          disabledReason === null;

        const isComplete =
          traditionalAccountComplete || v2AccountComplete;

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            stripeOnboardingComplete: isComplete,
          },
        });

        this.logger.log(
          `User ${userId} stripeOnboardingComplete=${isComplete} ` +
            `currentlyDue=${currentlyDue.length} ` +
            `pastDue=${pastDue.length} ` +
            `disabledReason=${disabledReason ?? 'none'} ` +
            `appliedConfigurations=${
              accountData.applied_configurations?.join(',') ?? 'none'
            }`,
        );

        break;
      }

      default:
        this.logger.debug(
          `Ignoring unhandled event type: ${event.type}`,
        );
    }

    return { received: true };
  }
}