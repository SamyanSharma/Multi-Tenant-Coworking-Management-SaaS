# Booking overlap exclusion constraint — historical note

**Status: APPLIED.** It is a regular migration:
`prisma/migrations/20260821202823_add_booking_overlap_exclusion/`. Nothing in
this folder needs to be run. `add_booking_overlap_exclusion.sql` is kept only
as the original write-up of the constraint.

## Why it exists

`@@unique([bookableType, bookableId, startTime])` only rejects a second
booking with the *exact same* `startTime`. A 2:00–3:00 booking and a
2:30–3:30 booking on the same desk have different start times, so the unique
index alone lets both through — a real double-booking.

A Postgres `EXCLUDE USING gist` constraint rejects genuinely overlapping time
ranges for the same resource, and the database enforces it atomically, so it
holds even when many requests arrive at the same moment. That is stronger than
application-level locking.

## How the app uses it

- Prisma's schema language cannot express `EXCLUDE`, so it lives in raw SQL in
  the migration (Prisma ignores objects it cannot model, so `migrate dev` does
  not drop it).
- Postgres raises SQLSTATE `23P01` (exclusion violation) rather than Prisma's
  `P2002`; `BookingsService.create` catches both and answers `409 Conflict`.
- Ranges are half-open, so a booking ending at 11:00 and one starting at 11:00
  do not clash.
- Proof: `apps/backend/test/booking-overlap.e2e-spec.ts`.

## Known limitation

The constraint does not exclude cancelled bookings. Today a booking is only
cancelled when its desk/room is soft-deleted, so nothing needs to be re-booked.
If member-initiated cancellation is ever added, the constraint needs a
`WHERE (cancelledAt IS NULL)` predicate so a cancelled slot can be rebooked.
