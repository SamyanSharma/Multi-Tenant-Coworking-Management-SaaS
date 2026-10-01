import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { WebhookController } from './webhook.controller';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [WebhookController, PaymentsController],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
