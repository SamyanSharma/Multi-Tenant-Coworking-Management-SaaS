import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  // Space_Manager AND Member can view zones in their own space.
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.zonesService.findAllForSpace(req.spaceId!);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.zonesService.findOne(id, req.spaceId!);
  }

  // Only Space_Manager can create zones.
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post()
  create(
    @Body() dto: CreateZoneDto,
    @Req() req: Request,
  ) {
    return this.zonesService.create(
      dto,
      req.spaceId!,
    );
  }

  // Only Space_Manager can edit zones.
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreateZoneDto,
    @Req() req: Request,
  ) {
    return this.zonesService.update(
      id,
      dto,
      req.spaceId!,
    );
  }
}