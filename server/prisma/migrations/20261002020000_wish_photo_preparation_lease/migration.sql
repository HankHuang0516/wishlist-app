-- Existing erasure tasks remain immediately eligible. New wish preparations
-- reserve an exact cleanup target before writing outside the DB transaction.
ALTER TABLE "MediaErasureTask" ADD COLUMN "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
