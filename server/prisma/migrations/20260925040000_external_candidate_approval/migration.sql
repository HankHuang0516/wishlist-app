ALTER TYPE "ExternalCandidateStatus" ADD VALUE 'APPROVED';

ALTER TABLE "ExternalListingCandidate"
  ADD COLUMN "approvalRef" TEXT,
  ADD COLUMN "approvedContentHash" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);
