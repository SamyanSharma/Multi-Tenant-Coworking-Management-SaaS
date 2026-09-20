import {
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { DeletionService } from './deletion.service';
import { requireSpaceId } from '../common/require-space';

// Retry a refund that failed (REFUND_FAILED) or got stuck (REFUND_PENDING)
// after a delete. Safe to call repeatedly: the Stripe refund is keyed by
// the booking id, so Stripe never refunds twice.
@Controller('bookings')
export class RefundsController {
  constructor(private readonly deletionService: DeletionService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post(':id/refund/retry')
  retry(@Param('id') id: string, @Req() req: Request) {
    return this.deletionService.retryRefund(id, requireSpaceId(req));
  }
}
