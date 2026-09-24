import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { SkipTenantCheck } from '../auth/skip-tenant-check.decorator';
import { AdminService } from './admin.service';

// Cross-tenant by design: only PLATFORM_ADMIN, and SkipTenantCheck because an
// admin is not scoped to one space. Every number is computed by AdminService
// with database aggregates.
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('overview')
  overview() {
    return this.adminService.overview();
  }

  // The "click into a space" drill-down (name, manager, live
  // zone/desk/room counts, revenue). :id is any space's id, not the
  // caller's own — unlike every other :id route in this app, which is
  // why this lives under /admin rather than /spaces/:id.
  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('spaces/:id')
  spaceDetail(@Param('id') id: string) {
    return this.adminService.getSpaceDetail(id);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('spaces/:id/bookings')
  spaceBookings(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.getSpaceBookings(
      id,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('spaces/:id/members')
  spaceMembers(@Param('id') id: string) {
    return this.adminService.getSpaceMembers(id);
  }
}
