import {
  Controller,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles, Role } from '../auth/roles.decorator';
import { DeletionService } from './deletion.service';
import { requireSpaceId } from '../common/require-space';


@Controller('bookings')
export class RefundsController {
  constructor(private readonly deletionService: DeletionService) {}

  @Roles(Role.SPACE_MANAGER)
  @Post(':id/refund/retry')
  retry(@Param('id') id: string, @Req() req: Request) {
    return this.deletionService.retryRefund(id, requireSpaceId(req));
  }
}
