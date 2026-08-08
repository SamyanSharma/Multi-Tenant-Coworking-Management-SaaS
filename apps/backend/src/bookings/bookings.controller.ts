import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.bookingsService.findAllForSpace(req.spaceId!);
  }

  // RBAC table: "Book a desk/room" -> Member only.
  @UseGuards(RbacGuard)
  @Roles(Role.MEMBER)
  @Post()
  create(@Body() dto: CreateBookingDto, @Req() req: Request) {
    // TODO(Stage 2 auth): userId should come from the authenticated
    // caller (decoded JWT -> User lookup), not a header. Using a
    // placeholder x-user-id header for now, same pattern as
    // TenantGuard/RbacGuard's placeholder headers, so the booking flow
    // is testable before real auth exists. Replace this line, not the
    // service's signature, once auth lands.
    const userId = req.headers['x-user-id'] as string;
    return this.bookingsService.create(dto, req.spaceId!, userId);
  }
}
