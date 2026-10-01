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
} from '@nestjs/common';
import type { Request } from 'express';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Roles, Role } from '../auth/roles.decorator';
import { DeletionService } from '../deletion/deletion.service';
import { requireSpaceId } from '../common/require-space';

@Controller('zones')
export class ZonesController {
  constructor(
    private readonly zonesService: ZonesService,
    private readonly deletionService: DeletionService,
  ) {}

  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get()
  findAll(@Req() req: Request) {
    return this.zonesService.findAllForSpace(
      requireSpaceId(req),
      req.user?.role === Role.MEMBER,
    );
  }

  @Roles(Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.zonesService.findOne(
      id,
      requireSpaceId(req),
      req.user?.role === Role.MEMBER,
    );
  }

  @Roles(Role.SPACE_MANAGER)
  @Post()
  create(
    @Body() dto: CreateZoneDto,
    @Req() req: Request,
  ) {
    return this.zonesService.create(
      dto,
      requireSpaceId(req),
    );
  }

  @Roles(Role.SPACE_MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @Req() req: Request,
  ) {
    return this.zonesService.update(
      id,
      dto,
      requireSpaceId(req),
    );
  }

  // Stage 9: what would deleting this zone remove / cancel / refund?
  @Roles(Role.SPACE_MANAGER)
  @Get(':id/delete-impact')
  deleteImpact(@Param('id') id: string, @Req() req: Request) {
    return this.deletionService.getImpact('ZONE', id, requireSpaceId(req));
  }

  
  @Roles(Role.SPACE_MANAGER)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('confirmRefund') confirmRefund: string | undefined,
    @Req() req: Request,
  ) {
    return this.deletionService.remove('ZONE', id, requireSpaceId(req), {
      confirmRefund: confirmRefund === 'true',
    });
  }
}
