CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
ADD CONSTRAINT "no_overlapping_bookings"
EXCLUDE USING gist (
  "bookableType" WITH =,
  "bookableId" WITH =,
  tstzrange("startTime", "endTime", '[)') WITH &&
);
