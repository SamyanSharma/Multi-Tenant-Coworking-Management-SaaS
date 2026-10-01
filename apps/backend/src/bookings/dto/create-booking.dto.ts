import { IsEnum, IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { BookableType } from '@prisma/client';

export class CreateBookingDto {
  @IsEnum(BookableType)
  bookableType: BookableType;

  @IsString()
  @IsNotEmpty()
  bookableId: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;
  
}
