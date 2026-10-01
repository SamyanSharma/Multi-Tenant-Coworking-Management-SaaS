-- A Space Manager can mark a zone inactive (temporarily unbookable) without
-- deleting it. Separate from the soft-delete column "deletedAt". Every
-- existing zone stays active.
--
-- IF NOT EXISTS keeps this safe to run twice: on a machine where Prisma's
-- schema engine is blocked the column may already have been added by hand
-- (psql / pgAdmin) before `prisma migrate` gets to record this migration.

ALTER TABLE "Zone" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
