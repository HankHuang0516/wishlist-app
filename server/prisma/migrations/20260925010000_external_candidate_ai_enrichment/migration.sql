CREATE TYPE "ExternalCandidateAiStatus" AS ENUM ('NOT_ELIGIBLE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "ExternalListingSource"
  ADD COLUMN "aiProcessingAllowed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ExternalListingCandidate"
  ADD COLUMN "aiStatus" "ExternalCandidateAiStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
  ADD COLUMN "aiInputHash" TEXT,
  ADD COLUMN "aiDraft" JSONB,
  ADD COLUMN "aiJobId" TEXT,
  ADD COLUMN "aiAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiUpdatedAt" TIMESTAMP(3);

CREATE INDEX "ExternalListingCandidate_aiStatus_aiUpdatedAt_idx" ON "ExternalListingCandidate"("aiStatus", "aiUpdatedAt");
