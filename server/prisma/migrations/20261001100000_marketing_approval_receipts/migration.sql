CREATE TABLE "MarketingApprovalReceipt" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "clientActionId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "sourceMediaId" UUID NOT NULL,
  "listingId" UUID,
  "requestHash" VARCHAR(64) NOT NULL,
  "state" VARCHAR(10) NOT NULL,
  "reason" TEXT,
  "appliedVersion" INTEGER,
  "selectedMediaIds" JSONB,
  "copy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingApprovalReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingApprovalReceipt_state_check" CHECK (
    ("state"='APPLIED' AND "reason" IS NULL AND "appliedVersion" IS NOT NULL AND "appliedVersion" BETWEEN 1 AND 1000001
     AND "selectedMediaIds" IS NOT NULL AND jsonb_typeof("selectedMediaIds")='array'
     AND jsonb_array_length("selectedMediaIds") BETWEEN 1 AND 4
     AND "copy" IS NOT NULL AND char_length("copy") BETWEEN 20 AND 1200)
    OR ("state"='CONFLICT' AND "reason" IS NOT NULL AND "appliedVersion" IS NULL AND "selectedMediaIds" IS NULL AND "copy" IS NULL)
    OR ("state"='ABANDONED' AND "reason" IS NULL AND "appliedVersion" IS NULL AND "selectedMediaIds" IS NULL AND "copy" IS NULL))
);
CREATE UNIQUE INDEX "MarketingApprovalReceipt_userId_clientActionId_key" ON "MarketingApprovalReceipt"("userId", "clientActionId");
CREATE INDEX "MarketingApprovalReceipt_userId_jobId_idx" ON "MarketingApprovalReceipt"("userId", "jobId");
CREATE UNIQUE INDEX "MarketingApprovalReceipt_once_applied" ON "MarketingApprovalReceipt"("userId", "jobId") WHERE "state"='APPLIED';
ALTER TABLE "MarketingApprovalReceipt" ADD CONSTRAINT "MarketingApprovalReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
