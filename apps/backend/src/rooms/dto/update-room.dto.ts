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

  // See UpdateDeskDto's comment — same "omit means unchanged" rule.
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRateCents?: number;
}
