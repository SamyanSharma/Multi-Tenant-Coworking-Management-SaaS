import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipTenantCheck } from './auth/skip-tenant-check.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Exempt from the global TenantGuard — this doubles as a health-check
  // route for deployment platforms (Railway/Render), which won't send an
  // x-space-id header. See the "before you wire this into app.module.ts"
  // note from Stage 1.
  @SkipTenantCheck()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
