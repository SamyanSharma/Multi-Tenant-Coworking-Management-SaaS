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
import { SkipThrottle } from '@nestjs/throttler';
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


  @SkipThrottle()
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

       
        const { count } = await this.prisma.booking.updateMany({
          where: {
            id: bookingId,
            paymentStatus: { in: ['UNPAID', 'PENDING', 'FAILED'] },
            cancelledAt: null,
          },
          data: {
            paymentStatus: 'PAID',
            stripePaymentIntentId: paymentIntent.id,
            holdExpiresAt: null,
            // Stage 9: revenue time windows key off paidAt.
            paidAt: new Date(),
          },
        });

        if (count === 0) {
          this.logger.warn(
            `payment_intent.succeeded (${paymentIntent.id}) ignored: booking ` +
              `${bookingId} is missing, already paid/refunded, or cancelled`,
          );
        } else {
          this.logger.log(`Booking ${bookingId} marked PAID`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata?.bookingId;

        if (bookingId) {
          // Only the PaymentIntent the booking is CURRENTLY waiting on may
          // fail it (stripePaymentIntentId must match), and only from a
          // not-yet-paid state. Otherwise a late failure event for an
          // abandoned first attempt would flip a booking that was since
          // retried (new PaymentIntent) or already paid back to FAILED.
          const { count } = await this.prisma.booking.updateMany({
            where: {
              id: bookingId,
              stripePaymentIntentId: paymentIntent.id,
              paymentStatus: { in: ['UNPAID', 'PENDING'] },
              cancelledAt: null,
            },
            data: {
              paymentStatus: 'FAILED',
            },
          });

          if (count === 0) {
            this.logger.warn(
              `payment_intent.payment_failed (${paymentIntent.id}) ignored: ` +
                `booking ${bookingId} is no longer waiting on this PaymentIntent`,
            );
          } else {
            this.logger.log(`Booking ${bookingId} marked FAILED`);
          }
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

        const { isComplete, currentlyDue, pastDue, disabledReason } =
          StripeService.computeOnboardingStatus(
            account as Stripe.Account & {
              requirements?: {
                currently_due?: string[] | null;
                past_due?: string[] | null;
                disabled_reason?: string | null;
              } | null;
              applied_configurations?: string[] | null;
            },
          );

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
            `disabledReason=${disabledReason ?? 'none'}`,
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