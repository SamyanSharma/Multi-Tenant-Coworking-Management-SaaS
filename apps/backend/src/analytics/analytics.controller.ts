import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

/**
 * No @SkipTenantCheck() anywhere in this controller — the global
 * TenantGuard (see app.module.ts) applies to every route here by
 * default, same as every other resource controller. This is what the
 * task doc means by "strictly apply the existing TenantGuard": every
 * query in AnalyticsService is scoped to req.spaceId, so a Space_Manager
 * calling these routes can only ever see aggregates for their own space
 * — there is no code path here that accepts an arbitrary spaceId from
 * the request body or query string.
 *
 * Restricted to SPACE_MANAGER (their own space) and PLATFORM_ADMIN
 * (any space, by supplying that space's x-space-id) — MEMBER excluded,
 * since aggregate reporting is a management concern, not a booking
 * concern. This role split wasn't explicitly specified in PRD.md/
 * ARCHITECTURE.md's RBAC table; flagging it as an assumption rather
 * than silently deciding it — worth confirming this matches actual
 * product intent.
 */
@Controller('analytics')
@UseGuards(RbacGuard)
@Roles(Role.SPACE_MANAGER, Role.PLATFORM_ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('bookings-per-zone')
  bookingsPerZone(@Req() req: Request) {
    return this.analyticsService.bookingsPerZone(req.spaceId!);
  }

  @Get('summary')
  summary(@Req() req: Request) {
    return this.analyticsService.spaceSummary(req.spaceId!);
  }
}
