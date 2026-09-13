import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('payments')
@UseGuards(RbacGuard)
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.SPACE_MANAGER)
  @Post('onboard')
  async onboard(@Req() req: Request) {
    const userId = req.user?.id;
    const spaceId = req.spaceId;

    if (!userId) {
      throw new BadRequestException('No authenticated user on request');
    }

    if (!spaceId) {
      throw new BadRequestException('Missing spaceId');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        spaceId,
        role: Role.SPACE_MANAGER,
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Space Manager not found in this space',
      );
    }

    const accountId =
      await this.stripeService.createOrGetConnectAccount({
        id: user.id,
        email: user.email,
        stripeAccountId: user.stripeAccountId,
      });

    if (!user.stripeAccountId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: accountId,
        },
      });
    }

    const frontendUrl =
      process.env.FRONTEND_URL ?? 'http://localhost:3001';

    const onboardingUrl =
      await this.stripeService.createOnboardingLink(
        accountId,
        `${frontendUrl}/dashboard/settings/billing`,
        `${frontendUrl}/dashboard/settings/billing`,
      );

    return {
      url: onboardingUrl,
    };
  }

  // Actively checks Stripe rather than only trusting the
  // account.updated webhook, which never arrives in local dev unless
  // `stripe listen` is forwarding to this backend. Also self-heals:
  // if Stripe now reports the account complete but the DB still says
  // false (exactly the stuck state this fixes), it updates the DB
  // here so bookings.service.ts's payment checks see the correction
  // too, not just this endpoint's own response.
  @Roles(Role.SPACE_MANAGER)
  @Get('status')
  async status(@Req() req: Request) {
    const userId = req.user?.id;
    const spaceId = req.spaceId;

    if (!userId) {
      throw new BadRequestException('No authenticated user on request');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, spaceId, role: Role.SPACE_MANAGER },
    });

    if (!user) {
      throw new BadRequestException(
        'Space Manager not found in this space',
      );
    }

    if (!user.stripeAccountId) {
      return {
        connected: false,
        onboardingComplete: false,
        currentlyDue: [],
        pastDue: [],
        disabledReason: null,
      };
    }

    const { isComplete, currentlyDue, pastDue, disabledReason } =
      await this.stripeService.getAccountStatus(user.stripeAccountId);

    if (isComplete !== user.stripeOnboardingComplete) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { stripeOnboardingComplete: isComplete },
      });
    }

    return {
      connected: true,
      onboardingComplete: isComplete,
      currentlyDue,
      pastDue,
      disabledReason,
    };
  }
}