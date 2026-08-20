import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set — see .env.example');
    }
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  // NOTE: assumes Space gets a `stripeAccountId` column — doesn't exist
  // in schema.prisma yet. Needs a migration:
  //   model Space { ... stripeAccountId String? }
  async getStatus(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { stripeAccountId: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    return {
      onboarded: Boolean(space.stripeAccountId),
      stripeAccountId: space.stripeAccountId ?? null,
    };
  }

  async createOnboardingLink(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');

    let accountId = space.stripeAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({ type: 'standard' });
      accountId = account.id;
      await this.prisma.space.update({
        where: { id: spaceId },
        data: { stripeAccountId: accountId },
      });
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/dashboard/settings/billing`,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings/billing`,
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  }

  // 95/5 split per PRD.md. PLACEHOLDER: no `price` field exists on
  // Booking/Desk/Room yet — a real implementation needs a real price
  // source before this is more than a demo.
  async createCheckoutSession(bookingId: string, spaceId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space?.stripeAccountId) {
      throw new BadRequestException('This space has not connected Stripe yet');
    }

    const PLACEHOLDER_AMOUNT_CENTS = 2000; // $20.00
    const platformFeeCents = Math.round(PLACEHOLDER_AMOUNT_CENTS * 0.05);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Booking ${booking.id}` },
            unit_amount: PLACEHOLDER_AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: space.stripeAccountId },
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard/bookings?paid=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/bookings?paid=false`,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { url: session.url };
  }
}
