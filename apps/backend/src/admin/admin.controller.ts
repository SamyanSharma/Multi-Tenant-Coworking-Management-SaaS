import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
