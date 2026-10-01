import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipTenantCheck } from './auth/skip-tenant-check.decorator';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @SkipTenantCheck()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
