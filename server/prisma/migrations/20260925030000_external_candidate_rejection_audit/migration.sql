ALTER TABLE "ExternalListingCandidate"
  ADD COLUMN "rejectionRef" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "rejectedContentHash" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3);
