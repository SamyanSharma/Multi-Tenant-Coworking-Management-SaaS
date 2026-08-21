-- OPTIONAL — NOT applied automatically. See README.md in this folder.
--
-- The @@unique([bookableType, bookableId, startTime]) constraint in
-- schema.prisma only blocks bookings that start at the EXACT same
-- instant. It does NOT block partial overlaps (e.g. 2:00-3:00 vs
-- 2:30-3:30 both succeed with just the unique constraint).
--
-- This adds a Postgres EXCLUDE constraint for genuine range-overlap
-- protection, enforced by the database itself — consistent with
-- ARCHITECTURE.md's original Concurrency Strategy reasoning ("the
-- database itself guarantees no two overlapping bookings can commit").
--
-- Prisma does not support EXCLUDE constraints natively, so this can't
-- live in schema.prisma — it has to be applied as a raw migration.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  "bookableType" WITH =,
  "bookableId" WITH =,
  tsrange("startTime", "endTime") WITH &&
);

