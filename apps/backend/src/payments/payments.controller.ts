import {
  Controller,
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

  /**
   * Starts (or resumes) Stripe Connect onboarding for the calling
   * Space_Manager, returning a hosted onboarding URL the frontend should
   * redirect the user to. Only SPACE_MANAGER — a Member or Platform_Admin
   * has no reason to link a payout account.
   *
   * NOTE: `userId` is read from a placeholder `x-user-id` header here,
   * same interim pattern as BookingsController — see that file's TODO
   * comment about replacing this with auth-derived identity once real
   * JWT auth exists. Both should be updated together.
   */
  @Roles(Role.SPACE_MANAGER)
  @Post('onboard')
  async onboard(@Req() req: Request) {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const accountId = await this.stripeService.createOrGetConnectAccount({
      id: user.id,
      email: user.email,
      stripeAccountId: user.stripeAccountId,
    });

    // Persist immediately on first creation — an account existing is not
    // the same as onboarding being complete (see
    // User.stripeOnboardingComplete's comment in schema.prisma), but we
    // still want the id saved right away so createOrGetConnectAccount is
    // truly idempotent on the next call.
    if (!user.stripeAccountId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeAccountId: accountId },
      });
    }

    // Frontend URLs — hardcoded to localhost for now since there's no
    // deployed frontend origin configured anywhere yet (see PROGRESS.md's
    // hosting-choice open question). Move to an env var once that's
    // decided, same as the Socket.io gateway's CORS origin TODO.
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const onboardingUrl = await this.stripeService.createOnboardingLink(
      accountId,
      `${frontendUrl}/dashboard/payments/onboard/refresh`,
      `${frontendUrl}/dashboard/payments/onboard/complete`,
    );

    return { url: onboardingUrl };
  }
}
