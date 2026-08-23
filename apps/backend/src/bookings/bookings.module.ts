import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { EventsModule } from '../events/events.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    EventsModule,
    PaymentsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
