import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsGateway } from './bookings.gateway';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingsGateway],
})
export class BookingsModule {}
