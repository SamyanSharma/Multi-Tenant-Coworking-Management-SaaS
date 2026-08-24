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
   * Space_Manager.
   *
   * The current project still uses x-user-id as a placeholder for
   * authenticated identity until JWT auth is implemented.
   *
   * IMPORTANT:
   * The user lookup is scoped to req.spaceId as well as userId.
   * This prevents a Space_Manager from one tenant from supplying
   * another tenant's user id and creating/linking a Stripe account
   * for that user.
   */
  @Roles(Role.SPACE_MANAGER)
  @Post('onboard')
  async onboard(@Req() req: Request) {
    const userId = req.headers['x-user-id'] as string | undefined;
    const spaceId = req.spaceId;

    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }

    if (!spaceId) {
      throw new BadRequestException('Missing spaceId');
    }

    /*
     * Tenant-scoped lookup:
     *
     * A valid userId by itself is NOT enough.
     * The user must:
     *   1. have the supplied userId,
     *   2. belong to this request's space, and
     *   3. actually be a SPACE_MANAGER.
     *
     * This prevents cross-tenant Stripe account linkage.
     */
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

    /*
     * Reuse an existing Stripe Connect account when one is already
     * stored; otherwise create a new Express Connect account.
     */
    const accountId =
      await this.stripeService.createOrGetConnectAccount({
        id: user.id,
        email: user.email,
        stripeAccountId: user.stripeAccountId,
      });

    /*
     * Persist the Stripe account id immediately when this is the
     * first onboarding attempt.
     *
     * Having a Stripe account is NOT the same as completing
     * Stripe onboarding. Completion is confirmed separately by
     * the account.updated webhook.
     */
    if (!user.stripeAccountId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: accountId,
        },
      });
    }

    /*
     * Stripe Account Links are one-time-use URLs.
     *
     * FRONTEND_URL can be configured for deployment while keeping
     * localhost:3001 as the local-development default.
     */
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
}