import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { Roles, Role } from '../auth/roles.decorator';
import { requireSpaceId } from '../common/require-space';


@Controller('analytics')
@Roles(Role.SPACE_MANAGER, Role.PLATFORM_ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('bookings-per-zone')
  bookingsPerZone(@Req() req: Request) {
    return this.analyticsService.bookingsPerZone(requireSpaceId(req));
  }

  // ?days=30 (clamped to 7..90 in the service; anything unparsable = 30)
  @Get('trends')
  trends(@Req() req: Request, @Query('days') days?: string) {
    return this.analyticsService.trends(
      requireSpaceId(req),
      days === undefined ? undefined : Number(days),
    );
  }

  @Get('summary')
  summary(@Req() req: Request) {
    return this.analyticsService.spaceSummary(requireSpaceId(req));
  }
}
