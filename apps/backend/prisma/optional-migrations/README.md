# Optional: Booking overlap exclusion constraint

**Status: NOT applied. Team decision pending — see ARCHITECTURE.md
Concurrency Strategy and the Stage 1-4 PR description's "Known
limitations" section.**

## The gap this closes

The `@@unique([bookableType, bookableId, startTime])` constraint
currently in `schema.prisma` only rejects a second booking with the
*exact same* `startTime`. A booking from 2:00-3:00 and another from
2:30-3:30 on the same desk have different `startTime` values, so both
succeed today — a real double-booking the current constraint does not
catch.

`add_booking_overlap_exclusion.sql` adds a Postgres `EXCLUDE` constraint
that blocks genuine range overlaps, enforced by the database itself.

## Why this isn't just applied automatically

1. Prisma doesn't support `EXCLUDE` constraints in `schema.prisma` — it
   has to be hand-applied as raw SQL, which means `prisma migrate dev`
   alone won't pick it up.
2. Whether to add this now vs. treat it as a documented follow-up is a
   real scope/timeline tradeoff for a 4-week capstone, not a pure
   correctness fix to apply silently — see the Timeline Risk Note in
   PRD.md. That's a team call.

## How to apply it, if the team decides to

```bash
# From apps/backend, with DATABASE_URL pointing at your dev DB:
npx prisma migrate dev --create-only --name add_booking_overlap_exclusion
# This creates an empty migration folder under prisma/migrations/.
# Copy the contents of add_booking_overlap_exclusion.sql into the
# generated migration.sql file, then:
npx prisma migrate dev
```

After applying, `BookingsService.create`'s catch block needs a second
branch: Postgres raises SQLSTATE `23P01` (exclusion violation) rather
than Prisma's `P2002` (unique violation) for this case. Recommend
triggering a real overlap locally and inspecting the actual thrown
error shape before writing that branch, rather than guessing the exact
property Prisma surfaces it under.
