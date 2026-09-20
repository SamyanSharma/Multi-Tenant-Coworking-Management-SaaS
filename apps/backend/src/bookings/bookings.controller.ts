import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { getCallerUserId } from '../auth/caller.util';
import { requireSpaceId } from '../common/require-space';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
  ) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.bookingsService.findAllForSpace(
      requireSpaceId(req),
    );
  }

  // Book a desk/room -> MEMBER only
  @UseGuards(RbacGuard)
  @Roles(Role.MEMBER)
  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    const userId = getCallerUserId(req);

    return this.bookingsService.create(
      dto,
      requireSpaceId(req),
      userId,
    );
  }

  // Re-attempt payment on a FAILED or still-UNPAID booking the caller
  // owns — e.g. after a declined test card, or once the Space Manager
  // finishes Stripe onboarding after the booking was already created.
  @UseGuards(RbacGuard)
  @Roles(Role.MEMBER)
  @Post(':id/pay')
  retryPayment(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const userId = getCallerUserId(req);

    return this.bookingsService.retryPayment(
      id,
      requireSpaceId(req),
      userId,
    );
  }
}
