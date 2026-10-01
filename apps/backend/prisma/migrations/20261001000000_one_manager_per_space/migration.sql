-- Enforce the business rule "one Space Manager per Space" in the database.
--
-- BookingsService, PaymentsController and the Stripe fee logic all look up
-- "the" manager of a space with findFirst({ spaceId, role: 'SPACE_MANAGER' }).
-- If a second manager ever existed, which one gets paid (and which Stripe
-- account receives the money) would be arbitrary. Until now nothing stopped
-- that from happening.
--
-- Prisma's schema language cannot express a PARTIAL unique index, so this is
-- hand-written SQL (same situation as the booking-overlap EXCLUDE
-- constraint). Prisma ignores indexes it can't model, so `prisma migrate dev`
-- will not try to drop it.
--
-- If this fails with "could not create unique index", the database already has
-- two managers in one space. Find them with:
--   SELECT "spaceId", count(*) FROM "User"
--   WHERE role = 'SPACE_MANAGER' AND "spaceId" IS NOT NULL
--   GROUP BY "spaceId" HAVING count(*) > 1;
-- ...resolve them (change one user's role or space), then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "User_one_manager_per_space"
  ON "User" ("spaceId")
  WHERE "role" = 'SPACE_MANAGER' AND "spaceId" IS NOT NULL;
