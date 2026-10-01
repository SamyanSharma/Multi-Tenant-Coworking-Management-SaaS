import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { EventsModule } from '../events/events.module';
import { DeletionService } from './deletion.service';
import { RefundsController } from './refunds.controller';

@Module({
  imports: [PaymentsModule, EventsModule],
  controllers: [RefundsController],
  providers: [DeletionService],
  exports: [DeletionService],
})
export class DeletionModule {}
