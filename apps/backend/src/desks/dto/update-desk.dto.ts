import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateDeskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}
