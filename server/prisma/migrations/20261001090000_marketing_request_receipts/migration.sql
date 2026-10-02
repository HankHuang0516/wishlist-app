-- Durable queue identity; erasing a job/photo must not release its request key.
CREATE TABLE "MarketingRequestReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingRequestReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketingRequestReceipt_state_check" CHECK (
        ("state" = 'QUEUED' AND "jobId" IS NOT NULL) OR
        ("state" = 'ABANDONED' AND "jobId" IS NULL))
);
CREATE UNIQUE INDEX "MarketingRequestReceipt_userId_clientRequestId_key" ON "MarketingRequestReceipt"("userId", "clientRequestId");
ALTER TABLE "MarketingRequestReceipt" ADD CONSTRAINT "MarketingRequestReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
