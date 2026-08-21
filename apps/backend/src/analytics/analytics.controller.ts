// Matches the pattern used by zones.controller.ts and every other
// controller — @Req() req: Request + req.spaceId! (set by TenantGuard),
// not raw @Headers().
//
// Role scoping is SPACE_MANAGER-only. PLATFORM_ADMIN cross-tenant
// analytics is an open product question — current RBAC grants that role
// no booking/revenue routes at all, so this is deliberately not guessed.

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  getSummary(@Req() req: Request) {
    return this.analyticsService.getSummary(req.spaceId!);
  }
}
