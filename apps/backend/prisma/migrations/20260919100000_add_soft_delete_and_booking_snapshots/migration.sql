-- Stage 9.1a, migration 1 of 2: soft-delete columns + Booking snapshot
-- columns, with a backfill for existing rows.
--
-- Why: deleting a Space/Zone/Desk/Room must never destroy payment history
-- (see ARCHITECTURE.md, "Stage 9 design"). Booking gets its own spaceId,
-- readable name, fee and paid-at snapshots so revenue and history no longer
-- depend on live Desk/Room rows.
--
-- Everything is added NULLABLE here and backfilled; migration 2
-- (20260919100100_booking_spaceid_required_and_restrict_fks) then enforces
-- NOT NULL on Booking.spaceId and refuses to run, with a readable error, if
-- any booking could not be attributed to a space.
--
-- NOTE: the new PaymentStatus values are added below but must not be USED in
-- this file -- Postgres does not allow using an enum value added in the same
-- transaction.

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_FAILED';

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('RESOURCE_DELETED', 'SPACE_CLOSED');

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Desk" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "spaceId" TEXT,
ADD COLUMN     "bookableName" TEXT,
ADD COLUMN     "platformFeeCents" INTEGER,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" "CancellationReason",
ADD COLUMN     "stripeRefundId" TEXT,
ADD COLUMN     "refundedAmountCents" INTEGER;

-- Backfill: which space (and which named desk/room) each existing booking
-- belongs to, resolved through the polymorphic bookableType/bookableId.
UPDATE "Booking" b
   SET "spaceId" = z."spaceId",
       "bookableName" = d."name"
  FROM "Desk" d
  JOIN "Zone" z ON z."id" = d."zoneId"
 WHERE b."bookableType" = 'DESK'
   AND b."bookableId" = d."id";

UPDATE "Booking" b
   SET "spaceId" = z."spaceId",
       "bookableName" = r."name"
  FROM "Room" r
  JOIN "Zone" z ON z."id" = r."zoneId"
 WHERE b."bookableType" = 'ROOM'
   AND b."bookableId" = r."id";

-- Backfill: paidAt. The real payment time was never stored, so the booking's
-- creation time is the closest available value (a PaymentIntent is created
-- with the booking, and payment happens within the 15-minute hold).
UPDATE "Booking"
   SET "paidAt" = "createdAt"
 WHERE "paymentStatus" = 'PAID';

-- Backfill: the platform fee, mirroring StripeService.calculateFeeSplit
-- (Math.round(amount * 5 / 100)). Only rows that have a PaymentIntent
-- (PAID, PENDING) ever charged a fee; UNPAID/FAILED rows stay NULL.
UPDATE "Booking"
   SET "platformFeeCents" = ROUND("amountCents" * 5 / 100.0)
 WHERE "amountCents" IS NOT NULL
   AND "paymentStatus" IN ('PAID', 'PENDING');

-- CreateIndex
CREATE INDEX "Space_deletedAt_idx" ON "Space"("deletedAt");

-- CreateIndex
CREATE INDEX "Zone_spaceId_deletedAt_idx" ON "Zone"("spaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "Desk_zoneId_deletedAt_idx" ON "Desk"("zoneId", "deletedAt");

-- CreateIndex
CREATE INDEX "Room_zoneId_deletedAt_idx" ON "Room"("zoneId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_stripeRefundId_key" ON "Booking"("stripeRefundId");

-- CreateIndex
CREATE INDEX "Booking_spaceId_paymentStatus_idx" ON "Booking"("spaceId", "paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_paidAt_idx" ON "Booking"("paymentStatus", "paidAt");
