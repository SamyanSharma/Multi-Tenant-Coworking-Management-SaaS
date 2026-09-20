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
import { DesksService } from './desks.service';
import { CreateDeskDto } from './dto/create-desk.dto';
import { UpdateDeskDto } from './dto/update-desk.dto';
import { DeletionService } from '../deletion/deletion.service';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { requireSpaceId } from '../common/require-space';

@Controller('desks')
export class DesksController {
  constructor(
    private readonly desksService: DesksService,
    private readonly deletionService: DeletionService,
  ) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.desksService.findAllForSpace(requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.desksService.findOne(id, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post()
  create(@Body() dto: CreateDeskDto, @Req() req: Request) {
    return this.desksService.create(dto, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeskDto,
    @Req() req: Request,
  ) {
    return this.desksService.update(id, dto, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Get(':id/delete-impact')
  deleteImpact(@Param('id') id: string, @Req() req: Request) {
    return this.deletionService.getImpact('DESK', id, requireSpaceId(req));
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('confirmRefund') confirmRefund: string | undefined,
    @Req() req: Request,
  ) {
    return this.deletionService.remove('DESK', id, requireSpaceId(req), {
      confirmRefund: confirmRefund === 'true',
    });
  }
}
