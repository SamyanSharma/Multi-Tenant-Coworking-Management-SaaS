import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

import { RbacGuard } from '../auth/rbac.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { getCallerUserId } from '../auth/caller.util';

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
      req.spaceId!,
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
      req.spaceId!,
      userId,
    );
  }
}
