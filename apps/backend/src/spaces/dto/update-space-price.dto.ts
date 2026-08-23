import { IsInt, Min } from 'class-validator';

export class UpdateSpacePriceDto {
  @IsInt()
  @Min(1)
  priceCents: number;
}