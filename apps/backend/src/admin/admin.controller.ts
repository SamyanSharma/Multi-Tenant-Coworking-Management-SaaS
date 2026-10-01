import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles, Role } from '../auth/roles.decorator';
import { SkipTenantCheck } from '../auth/skip-tenant-check.decorator';
import { AdminService } from './admin.service';


@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('overview')
  overview() {
    return this.adminService.overview();
  }


  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('trends')
  trends(@Query('days') days?: string) {
    return this.adminService.trends(days === undefined ? undefined : Number(days));
  }


  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('spaces/:id')
  spaceDetail(@Param('id') id: string) {
    return this.adminService.getSpaceDetail(id);
  }

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

  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get('spaces/:id/members')
  spaceMembers(@Param('id') id: string) {
    return this.adminService.getSpaceMembers(id);
  }
}
