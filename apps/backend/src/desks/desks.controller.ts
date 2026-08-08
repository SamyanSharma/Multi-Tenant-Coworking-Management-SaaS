import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DesksService } from './desks.service';
import { CreateDeskDto } from './dto/create-desk.dto';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('desks')
export class DesksController {
  constructor(private readonly desksService: DesksService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.desksService.findAllForSpace(req.spaceId!);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.desksService.findOne(id, req.spaceId!);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post()
  create(@Body() dto: CreateDeskDto, @Req() req: Request) {
    return this.desksService.create(dto, req.spaceId!);
  }
}
