
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  // deliberately NO spaceId field — see note in service above
}
