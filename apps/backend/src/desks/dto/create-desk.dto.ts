import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDeskDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  zoneId: string;
}
