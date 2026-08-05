// apps/backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './auth/tenant.guard';
// ... your existing imports (spaces, zones, desks, rooms, bookings modules, etc.)

@Module({
  imports: [
    // ...existing module imports
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
