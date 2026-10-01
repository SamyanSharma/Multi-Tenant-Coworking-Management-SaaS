-- Per-resource pricing: a Space Manager sets an hourly and/or daily
-- rate on each Desk/Room instead of relying on a single flat
-- Space.priceCents that's easy to forget to set (the actual root cause
-- of "Booking price has not been configured for this space" bookings
-- were failing with). Both columns are nullable at the schema level
-- for the same reason Booking's payment columns are: existing rows
-- (desks/rooms created before this migration) have neither set yet.
-- DesksService/RoomsService.create() requires at least one of the two
-- going forward for any NEW desk/room; a pre-existing one with neither
-- set still falls back to Space.priceCents at booking time (see
-- BookingsService.calculateAmountCents) rather than being silently
-- unbookable after this migration lands.

ALTER TABLE "Desk" ADD COLUMN "hourlyRateCents" INTEGER;
ALTER TABLE "Desk" ADD COLUMN "dailyRateCents" INTEGER;

ALTER TABLE "Room" ADD COLUMN "hourlyRateCents" INTEGER;
ALTER TABLE "Room" ADD COLUMN "dailyRateCents" INTEGER;
