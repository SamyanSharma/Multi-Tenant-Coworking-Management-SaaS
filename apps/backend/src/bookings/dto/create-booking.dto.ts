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
  // Deliberately NO userId field — derived from the authenticated
  // caller once real auth exists (Stage 2). For now, wire this to
  // whatever placeholder-user mechanism the team agrees on; see the
  // TODO in BookingsController.
}
