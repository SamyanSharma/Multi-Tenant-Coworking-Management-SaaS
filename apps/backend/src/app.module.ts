import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TenantGuard } from './auth/tenant.guard';
import { RbacGuard } from './auth/rbac.guard';
import { SpacesModule } from './spaces/spaces.module';
import { ZonesModule } from './zones/zones.module';
import { DesksModule } from './desks/desks.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';
import { EventsModule } from './events/events.module';
import { PaymentsModule } from './payments/payments.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // Global safety net: 120 requests/minute per client IP. The sensitive
    // routes (login, signup) tighten this with @Throttle(); the Stripe
    // webhook opts out with @SkipThrottle(). Skipped under Jest
    // (NODE_ENV=test) so the e2e suite can fire many requests quickly; the
    // dedicated throttle e2e spec switches it back on.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    AuthModule,
    SpacesModule,
    ZonesModule,
    DesksModule,
    RoomsModule,
    BookingsModule,
    EventsModule,
    PaymentsModule,
    AnalyticsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: Nest runs global guards in registration order.
    // ThrottlerGuard goes first so brute-force attempts are cut off before
    // any token parsing or database work happens.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JwtAuthGuard MUST run before TenantGuard/RbacGuard, since both
    // of those read req.user, which only JwtAuthGuard sets.
    // RbacGuard is global and deny-by-default: every route needs either
    // @Public() or @Roles(...) — see rbac.guard.ts.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
})
export class AppModule {}
