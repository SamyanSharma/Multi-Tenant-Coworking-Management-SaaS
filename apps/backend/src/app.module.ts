import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantGuard } from './auth/tenant.guard';
import { SpacesModule } from './spaces/spaces.module';
import { ZonesModule } from './zones/zones.module';
import { DesksModule } from './desks/desks.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';
import { EventsModule } from './events/events.module';
import { PaymentsModule } from './payments/payments.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    PrismaModule,
    SpacesModule,
    ZonesModule,
    DesksModule,
    RoomsModule,
    BookingsModule,
    EventsModule,
    PaymentsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered via the APP_GUARD DI token (not app.useGlobalGuards in
    // main.ts) so TenantGuard can inject Reflector — and later, anything
    // else it needs (e.g. a Prisma lookup) — through Nest's DI container.
    // This makes EVERY route require a valid x-space-id header by
    // default; use @SkipTenantCheck() to opt a route out.
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
