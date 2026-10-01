import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';

import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { Roles, Role } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { SkipTenantCheck } from '../auth/skip-tenant-check.decorator';
import { UpdateSpacePriceDto } from './dto/update-space-price.dto';
import { requireSpaceId } from '../common/require-space';
import { getCallerUserId } from '../auth/caller.util';

@Controller('spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Roles(Role.PLATFORM_ADMIN)
  @SkipTenantCheck()
  @Get()
  findAll() {
    return this.spacesService.findAll();
  }
  @Public()
  @SkipTenantCheck()
  @Get('public')
  findPublic() {
    return this.spacesService.findPublic();
  }

  @Roles(Role.PLATFORM_ADMIN, Role.SPACE_MANAGER, Role.MEMBER)
  @Get('me')
  findOwn(@Req() req: Request) {
    return this.spacesService.findOwnSpace(
      requireSpaceId(req),
      req.user?.role === Role.MEMBER,
    );
  }


  @Roles(Role.PLATFORM_ADMIN, Role.SPACE_MANAGER, Role.MEMBER)
  @Get(':id')
  findById(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    if (id !== req.spaceId) {
      return this.spacesService.findOwnSpace('__invalid_space__');
    }

    return this.spacesService.findOwnSpace(id, req.user?.role === Role.MEMBER);
  }

  @Roles(Role.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateSpaceDto) {
    return this.spacesService.create(dto);
  }

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

  // A MEMBER with no space yet (signup no longer assigns one — see
  // SignupDto) picks one from GET /spaces/public and calls this.
  // @SkipTenantCheck(): TenantGuard would otherwise reject this exact
  // caller with "User has no associated space" before the handler ever
  // runs, since they don't have one yet — that's the whole point of
  // this endpoint. Returns a fresh accessToken (the old one's JWT still
  // carries spaceId: null) — same response shape as login/signup.
  @Roles(Role.MEMBER)
  @SkipTenantCheck()
  @Post(':id/join')
  join(@Param('id') id: string, @Req() req: Request) {
    return this.spacesService.join(getCallerUserId(req), id);
  }
}