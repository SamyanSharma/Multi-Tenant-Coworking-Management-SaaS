-- Stage 9.1a, migration 2 of 2: make Booking.spaceId required, add its FK,
-- and switch the two "cascade a hard delete into payment history" foreign
-- keys to RESTRICT.
--
-- Kept separate from migration 1 on purpose: if the backfill could not
-- attribute some booking to a space (e.g. its desk/room row was deleted by
-- hand), this migration stops with a readable message instead of failing
-- with a bare "column contains null values".

DO $$
DECLARE
  unattributed integer;
BEGIN
  SELECT count(*) INTO unattributed FROM "Booking" WHERE "spaceId" IS NULL;

  IF unattributed > 0 THEN
    RAISE EXCEPTION
      'Cannot make Booking.spaceId required: % booking row(s) reference a desk/room that no longer exists, so their space cannot be determined. Inspect them with: SELECT id, "bookableType", "bookableId", "userId", "paymentStatus" FROM "Booking" WHERE "spaceId" IS NULL; then fix or remove them and re-run.',
      unattributed;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "spaceId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade -> Restrict: a hard delete must fail loudly instead of erasing
-- accounts or payment history. (Spaces/zones/desks/rooms are soft-deleted;
-- nothing in the app hard-deletes users.)
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_spaceId_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
