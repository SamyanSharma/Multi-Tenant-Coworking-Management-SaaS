import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDeskDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  zoneId: string;
  // zoneId IS required here (unlike spaceId on CreateZoneDto) because a
  // desk needs to know WHICH zone it belongs to — there's no "current
  // zone" on the request the way there's a "current space". The service
  // verifies this zoneId actually belongs to the caller's space before
  // ever using it — see DesksService.create.
}
