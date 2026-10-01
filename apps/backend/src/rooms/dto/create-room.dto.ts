import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsString()
  @IsNotEmpty()
  zoneId: string;

  // At least one of these two is required — enforced in
  // RoomsService.create (see CreateDeskDto's comment; same reasoning).
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRateCents?: number;
}
