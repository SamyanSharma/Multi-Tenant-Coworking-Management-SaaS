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

  // Resolves a booking's owning Space the same way bookings.service.ts's
  // resolveBookable() resolves a Desk/Room's owning Space — Booking has no
  // direct spaceId column (per ARCHITECTURE.md's polymorphic design), so
  // this walks bookableId -> Desk/Room -> Zone -> Space. Throws 404 (not
  // 403) for a cross-tenant booking id, matching the rest of the codebase's
  // convention of not confirming another tenant's resource exists.
  private async assertBookingInSpace(bookingId: string, spaceId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const owningZoneSpaceId =
      booking.bookableType === 'DESK'
        ? (await this.prisma.desk.findUnique({
            where: { id: booking.bookableId },
            include: { zone: true },
          }))?.zone.spaceId
        : (await this.prisma.room.findUnique({
            where: { id: booking.bookableId },
            include: { zone: true },
          }))?.zone.spaceId;

    if (owningZoneSpaceId !== spaceId) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  // 95/5 split per PRD.md. PLACEHOLDER: no `price` field exists on
  // Booking/Desk/Room yet — a real implementation needs a real price
  // source before this is more than a demo.
  async createCheckoutSession(bookingId: string, spaceId: string, callerUserId: string) {
    const booking = await this.assertBookingInSpace(bookingId, spaceId);

    // Ownership check: a MEMBER should only be able to pay for their own
    // booking, not any booking in the space. TODO(Stage 2 auth): once real
    // auth exists, callerUserId should come from the authenticated JWT
    // rather than the x-user-id placeholder header — same caveat as
    // BookingsController's create() endpoint.
    if (booking.userId !== callerUserId) {
      throw new BadRequestException('This booking does not belong to you');
    }

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
