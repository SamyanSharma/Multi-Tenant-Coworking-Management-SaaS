import { IsString, IsNotEmpty, IsInt, IsOptional, Min, MaxLength } from 'class-validator';

export class UpdateDeskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  // Optional on update: a manager renaming a desk shouldn't be forced
  // to resend its rates. Omit both to leave rates unchanged; send
  // either (or both) to change them. Sending neither is NOT the same
  // as clearing them — there's no "unset a rate" path yet (a desk must
  // always keep at least one rate; see DesksService.update).
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlyRateCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRateCents?: number;
}
