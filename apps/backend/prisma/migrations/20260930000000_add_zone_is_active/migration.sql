-- A Space Manager can mark a zone inactive (temporarily unbookable) without
-- deleting it. Separate from the soft-delete column "deletedAt". Every
-- existing zone stays active.

ALTER TABLE "Zone" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
