import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { BookableType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';
import { StripeService } from '../payments/stripe.service';

const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_EXCLUSION_CONSTRAINT_VIOLATION = 'P2039';
const POSTGRES_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly stripeService: StripeService,
  ) {}

  private async resolveBookable(
    bookableType: BookableType,
    bookableId: string,
    spaceId: string,
  ) {
    if (bookableType === BookableType.DESK) {
      const desk = await this.prisma.desk.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });

      if (!desk || desk.zone.spaceId !== spaceId) {
        throw new NotFoundException(
          'Desk not found in this space',
        );
      }

      return desk;
    }

    if (bookableType === BookableType.ROOM) {
      const room = await this.prisma.room.findUnique({
        where: { id: bookableId },
        include: { zone: true },
      });

      if (!room || room.zone.spaceId !== spaceId) {
        throw new NotFoundException(
          'Room not found in this space',
        );
      }

      return room;
    }

    throw new BadRequestException(
      `Unknown bookableType: ${bookableType}`,
    );
  }


  async findAllForSpace(spaceId: string) {
    const [desks, rooms] = await Promise.all([
      this.prisma.desk.findMany({
        where: {
          zone: { spaceId },
        },
        select: {
          id: true,
        },
      }),

      this.prisma.room.findMany({
        where: {
          zone: { spaceId },
        },
        select: {
          id: true,
        },
      }),
    ]);


    const deskIds = desks.map(
      (desk) => desk.id,
    );

    const roomIds = rooms.map(
      (room) => room.id,
    );


    return this.prisma.booking.findMany({
      where: {
        OR: [
          {
            bookableType: BookableType.DESK,
            bookableId: {
              in: deskIds,
            },
          },
          {
            bookableType: BookableType.ROOM,
            bookableId: {
              in: roomIds,
            },
          },
        ],
      },
    });
  }



  async create(
    dto: CreateBookingDto,
    spaceId: string,
    userId: string,
  ) {

    const {
      bookableType,
      bookableId,
      startTime,
      endTime,
    } = dto;


    if (
      new Date(startTime) >= new Date(endTime)
    ) {
      throw new BadRequestException(
        'startTime must be before endTime',
      );
    }


    await this.resolveBookable(
      bookableType,
      bookableId,
      spaceId,
    );


    const space =
      await this.prisma.space.findUnique({
        where: {
          id: spaceId,
        },
        select: {
          priceCents: true,
        },
      });


    if (
      !space ||
      space.priceCents === null
    ) {
      throw new BadRequestException(
        'Booking price has not been configured for this space',
      );
    }



    const spaceManager =
      await this.prisma.user.findFirst({
        where: {
          spaceId,
          role: 'SPACE_MANAGER',
        },
        select: {
          id: true,
          stripeAccountId: true,
          stripeOnboardingComplete: true,
        },
      });



    if (!spaceManager) {
      throw new BadRequestException(
        'No Space Manager is configured for this space',
      );
    }



    try {


      const booking =
        await this.prisma.$transaction(
          async (tx) => {

            return tx.booking.create({
              data: {
                bookableType,
                bookableId,
                userId,
                startTime,
                endTime,
                amountCents:
                  space.priceCents,
              },
            });

          },
        );



      let updatedBooking = booking;



      if (
        spaceManager.stripeAccountId &&
        spaceManager.stripeOnboardingComplete
      ) {

        try {

          const paymentIntent =
            await this.stripeService
              .createBookingPaymentIntent({
                amountCents:
                  space.priceCents,

                connectedAccountId:
                  spaceManager.stripeAccountId,

                bookingId:
                  booking.id,
              });



          updatedBooking =
            await this.prisma.booking.update({
              where: {
                id: booking.id,
              },

              data: {
                paymentStatus:
                  'PENDING',

                stripePaymentIntentId:
                  paymentIntent.id,
              },
            });


        } catch {

          /*
            Payment setup failed.

            Remove booking because a failed
            payment should not block the slot.
          */

          await this.prisma.booking.delete({
            where: {
              id: booking.id,
            },
          });


          throw new ConflictException(
            'Could not setup payment for booking',
          );
        }
      }



      this.eventsGateway.emitBookingCreated(
        spaceId,
        updatedBooking,
      );


      return updatedBooking;



       } catch (err: unknown) {

      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION;

      const isExclusionViolation =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (
          err.code === PRISMA_EXCLUSION_CONSTRAINT_VIOLATION ||
          (err as any).meta?.code ===
            POSTGRES_EXCLUSION_VIOLATION ||
          (err as any).meta?.driverAdapterError?.cause
            ?.originalCode === POSTGRES_EXCLUSION_VIOLATION
        );

      if (isUniqueViolation || isExclusionViolation) {
        throw new ConflictException(
          'This slot is already booked.',
        );
      }

      throw err;
    }
  }
}
