CREATE TABLE "ExternalCandidateReviewEvent" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "decision" "ExternalCandidateStatus" NOT NULL,
  "contentHash" TEXT NOT NULL,
  "reviewRef" TEXT NOT NULL,
  "reason" TEXT,
  "authorizationRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCandidateReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalCandidateReviewEvent_candidateId_createdAt_idx"
  ON "ExternalCandidateReviewEvent"("candidateId", "createdAt");

ALTER TABLE "ExternalCandidateReviewEvent"
  ADD CONSTRAINT "ExternalCandidateReviewEvent_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ExternalListingCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
