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
}