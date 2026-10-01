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
 
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
   
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
