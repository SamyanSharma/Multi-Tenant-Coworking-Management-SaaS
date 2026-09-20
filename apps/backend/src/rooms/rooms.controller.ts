import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { DeletionService } from '../deletion/deletion.service';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { requireSpaceId } from '../common/require-space';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly deletionService: DeletionService,
  ) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.roomsService.findAllForSpace(requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.roomsService.findOne(id, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post()
  create(@Body() dto: CreateRoomDto, @Req() req: Request) {
    return this.roomsService.create(dto, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: Request,
  ) {
    return this.roomsService.update(id, dto, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Get(':id/delete-impact')
  deleteImpact(@Param('id') id: string, @Req() req: Request) {
    return this.deletionService.getImpact('ROOM', id, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('confirmRefund') confirmRefund: string | undefined,
    @Req() req: Request,
  ) {
    return this.deletionService.remove('ROOM', id, requireSpaceId(req), {
      confirmRefund: confirmRefund === 'true',
    });
  }
}
