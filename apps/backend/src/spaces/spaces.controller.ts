import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';

import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { SkipTenantCheck } from '../auth/skip-tenant-check.decorator';
import { UpdateSpacePriceDto } from './dto/update-space-price.dto';
import { requireSpaceId } from '../common/require-space';

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get()
  findAll() {
    return this.spacesService.findAll();
  }

 
  @Get('me')
  findOwn(@Req() req: Request) {
    return this.spacesService.findOwnSpace(requireSpaceId(req));
  }


  @Get(':id')
  findById(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    if (id !== req.spaceId) {
      return this.spacesService.findOwnSpace('__invalid_space__');
    }

    return this.spacesService.findOwnSpace(id);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateSpaceDto) {
    return this.spacesService.create(dto);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post('me/price')
  updatePrice(
    @Body() dto: UpdateSpacePriceDto,
    @Req() req: Request,
  ) {
    return this.spacesService.updatePrice(
      requireSpaceId(req),
      dto.priceCents,
    );
  }
}