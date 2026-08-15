import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [WebhookController],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
