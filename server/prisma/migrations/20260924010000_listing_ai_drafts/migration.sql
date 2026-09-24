CREATE TYPE "ListingAiStatus" AS ENUM ('SKIPPED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "ListingMedia"
  ADD COLUMN "aiDraftStatus" "ListingAiStatus" NOT NULL DEFAULT 'SKIPPED',
  ADD COLUMN "aiDraft" JSONB,
  ADD COLUMN "aiDraftError" TEXT,
  ADD COLUMN "aiDraftJobId" TEXT,
  ADD COLUMN "aiDraftAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiDraftUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ListingMedia_aiDraftJobId_key" ON "ListingMedia"("aiDraftJobId");
CREATE INDEX "ListingMedia_aiDraftStatus_aiDraftUpdatedAt_idx" ON "ListingMedia"("aiDraftStatus", "aiDraftUpdatedAt");
