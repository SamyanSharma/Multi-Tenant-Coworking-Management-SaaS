// apps/backend/src/spaces/spaces.controller.ts
import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { RbacGuard } from '../auth/rbac.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('spaces')
export class SpacesController {
  constructor(private spacesService: SpacesService) {}

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @Get()
  findAll() {
    return this.spacesService.findAll();
  }

  @Get('me')
  findOwn(@Req() req: Request) {
    // req.spaceId is set by the global TenantGuard from Stage 1 — no @UseGuards needed here,
    // TenantGuard already ran on every request before this handler executes.
    return this.spacesService.findOwnSpace(req.spaceId!);
  }

  @UseGuards(RbacGuard)
  @Roles(Role.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateSpaceDto) {
    return this.spacesService.create(dto);
  }
}
