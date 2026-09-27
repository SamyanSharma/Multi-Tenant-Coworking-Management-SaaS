import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum SignupRole {
  SPACE_MANAGER = 'SPACE_MANAGER',
  MEMBER = 'MEMBER',
}

export class SignupDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  // Longer minimum than LoginDto's — this is account creation, not
  // just checking an existing password.
  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(SignupRole)
  role: SignupRole;

  // Required only when role === SPACE_MANAGER ("List my space") —
  // creates a brand-new space with this name.
  @ValidateIf((dto: SignupDto) => dto.role === SignupRole.SPACE_MANAGER)
  @IsString()
  @MinLength(2)
  spaceName?: string;

  // MEMBER ("Rent a space") no longer picks a space at signup at all —
  // deliberately removed. With many spaces on the platform, a dropdown
  // shown at registration doesn't scale, and there's no need to force
  // that choice before the account exists. A Member joins a space
  // afterward from the "browse all spaces" screen, which calls
  // POST /spaces/:id/join — see SpacesService.join.
}
