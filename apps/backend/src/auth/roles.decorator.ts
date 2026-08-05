import { SetMetadata } from '@nestjs/common';

export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SPACE_MANAGER = 'SPACE_MANAGER',
  MEMBER = 'MEMBER',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
