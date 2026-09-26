ALTER TYPE "ListingMediaPurpose" ADD VALUE 'AI_MARKETING';
CREATE TYPE "MarketingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW', 'COMPLETED', 'FAILED');

CREATE TABLE "MarketingJob" (
  "id" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "listingId" TEXT,
  "sourceMediaId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "parentJobId" TEXT,
  "status" "MarketingJobStatus" NOT NULL DEFAULT 'PENDING',
  "snapshot" JSONB NOT NULL,
  "revisionPrompt" TEXT,
  "revisionSlots" JSONB,
  "copy" TEXT,
  "workerLeaseId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "quotaPeriodStart" TIMESTAMP(3),
  "quotaPeriodEnd" TIMESTAMP(3),
  "failureCode" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ListingMedia" ADD COLUMN "marketingJobId" TEXT;
ALTER TABLE "ListingMedia" ADD COLUMN "marketingSlot" INTEGER;
ALTER TABLE "ListingMedia" ADD COLUMN "marketingSelected" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "MarketingJob_ownerUserId_clientRequestId_key" ON "MarketingJob"("ownerUserId", "clientRequestId");
CREATE UNIQUE INDEX "MarketingJob_parentJobId_key" ON "MarketingJob"("parentJobId");
CREATE UNIQUE INDEX "MarketingJob_workerLeaseId_key" ON "MarketingJob"("workerLeaseId");
CREATE INDEX "MarketingJob_status_createdAt_idx" ON "MarketingJob"("status", "createdAt");
CREATE INDEX "MarketingJob_ownerUserId_quotaPeriodStart_status_idx" ON "MarketingJob"("ownerUserId", "quotaPeriodStart", "status");
CREATE INDEX "MarketingJob_listingId_createdAt_idx" ON "MarketingJob"("listingId", "createdAt");
CREATE INDEX "MarketingJob_sourceMediaId_idx" ON "MarketingJob"("sourceMediaId");
CREATE UNIQUE INDEX "ListingMedia_marketingJobId_marketingSlot_key" ON "ListingMedia"("marketingJobId", "marketingSlot");

ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "MarketingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingJob" ADD CONSTRAINT "MarketingJob_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "ListingMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_marketingJobId_fkey" FOREIGN KEY ("marketingJobId") REFERENCES "MarketingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
