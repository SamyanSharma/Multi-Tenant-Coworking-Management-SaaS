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

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  /**
   * Platform admin can view all spaces.
   */
  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get()
  findAll() {
    return this.spacesService.findAll();
  }

  /**
   * Get the current tenant's own space.
   *
   * IMPORTANT:
   * This route must appear BEFORE @Get(':id').
   * Otherwise Nest interprets /spaces/me as /spaces/:id
   * with id = "me".
   */
  @Get('me')
  findOwn(@Req() req: Request) {
    return this.spacesService.findOwnSpace(req.spaceId!);
  }

  /**
   * Get a specific space.
   *
   * Tenant isolation:
   * The requested id must match the tenant's spaceId.
   */
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

  /**
   * Only Platform Admin can create spaces.
   */
  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateSpaceDto) {
    return this.spacesService.create(dto);
  }

  /**
   * Space Manager can update the price of their own space.
   */
  @UseGuards(RbacGuard)
  @Roles(Role.SPACE_MANAGER)
  @Post('me/price')
  updatePrice(
    @Body() dto: UpdateSpacePriceDto,
    @Req() req: Request,
  ) {
    return this.spacesService.updatePrice(
      req.spaceId!,
      dto.priceCents,
    );
  }
}