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

  // Required only when role === MEMBER ("Rent a space") — joins the
  // existing space with this slug. The slug is shown to Space
  // Managers on their space's dashboard page.
  @ValidateIf((dto: SignupDto) => dto.role === SignupRole.MEMBER)
  @IsString()
  @MinLength(1)
  spaceSlug?: string;
}
