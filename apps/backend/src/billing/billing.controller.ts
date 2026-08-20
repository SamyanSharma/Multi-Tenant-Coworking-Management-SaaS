import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  getStatus(@Req() req: Request) {
    return this.billingService.getStatus(req.spaceId!);
  }

  @Post('onboard')
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  onboard(@Req() req: Request) {
    return this.billingService.createOnboardingLink(req.spaceId!);
  }

  @Post('checkout')
  @UseGuards(RbacGuard)
  @Roles(Role.MEMBER)
  checkout(@Body() dto: CheckoutDto, @Req() req: Request) {
    return this.billingService.createCheckoutSession(dto.bookingId, req.spaceId!);
  }
}
