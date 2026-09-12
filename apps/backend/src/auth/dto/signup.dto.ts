import { IsEmail, IsString, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(2)
  spaceName: string;
}
