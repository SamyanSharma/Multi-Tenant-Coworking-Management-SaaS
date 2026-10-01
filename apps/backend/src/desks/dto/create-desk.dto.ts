import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';

export class CreateDeskDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  zoneId: string;

  // At least one of these two is required — enforced in
  // DesksService.create (a manager may want hourly-only, daily-only,
  // or both; class-validator has no clean "at least one of" check).
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRateCents?: number;
}
