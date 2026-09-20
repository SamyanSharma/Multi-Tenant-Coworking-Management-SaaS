import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
