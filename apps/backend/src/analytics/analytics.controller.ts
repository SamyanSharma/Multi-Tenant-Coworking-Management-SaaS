import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';


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
