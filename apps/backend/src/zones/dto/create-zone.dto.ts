import { IsString, IsNotEmpty } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  // Deliberately NO spaceId field — spaceId is always derived from the
  // guarded request (req.spaceId), never trusted from the client payload.
  // See ZonesService.create.
}
