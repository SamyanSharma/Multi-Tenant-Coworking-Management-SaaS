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

  // MEMBER ("Rent a space") joins an existing space either by picking it
  // from GET /spaces/public (spaceId) or by typing the join code a
  // manager shared with them (spaceSlug, shown on the manager's space
  // page). Both are optional here — AuthService.signupAsMember rejects
  // a MEMBER signup that supplies neither, since "required if role is
  // MEMBER, but only one of two fields" isn't expressible with
  // @ValidateIf alone (it only sees `dto`, not "did the other field win").
  @ValidateIf((dto: SignupDto) => dto.spaceId !== undefined)
  @IsString()
  @MinLength(1)
  spaceId?: string;

  @ValidateIf((dto: SignupDto) => dto.spaceSlug !== undefined)
  @IsString()
  @MinLength(1)
  spaceSlug?: string;
}
