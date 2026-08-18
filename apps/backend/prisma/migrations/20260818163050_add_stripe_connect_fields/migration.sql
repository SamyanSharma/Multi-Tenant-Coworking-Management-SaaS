/*
  Warnings:

  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookableType,bookableId,startTime]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `bookableType` on the `Booking` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "BookableType" AS ENUM ('DESK', 'ROOM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "amountCents" INTEGER,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "stripePaymentIntentId" TEXT,
DROP COLUMN "bookableType",
ADD COLUMN     "bookableType" "BookableType" NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_stripePaymentIntentId_key" ON "Booking"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Booking_bookableType_bookableId_idx" ON "Booking"("bookableType", "bookableId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookableType_bookableId_startTime_key" ON "Booking"("bookableType", "bookableId", "startTime");

-- CreateIndex
CREATE INDEX "Desk_zoneId_idx" ON "Desk"("zoneId");

-- CreateIndex
CREATE INDEX "Room_zoneId_idx" ON "Room"("zoneId");

-- CreateIndex
CREATE INDEX "User_spaceId_idx" ON "User"("spaceId");

-- CreateIndex
CREATE INDEX "Zone_spaceId_idx" ON "Zone"("spaceId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
