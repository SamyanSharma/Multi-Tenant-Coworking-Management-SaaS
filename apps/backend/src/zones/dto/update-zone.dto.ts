import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Partial update: send `name` (rename), `isActive` (toggle), or both.
export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
