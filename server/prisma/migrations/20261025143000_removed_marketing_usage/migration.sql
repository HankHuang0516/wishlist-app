-- Preserve only consumed allowance when a seller removes private draft pixels.
-- No original photo, product description or generated copy is retained here.
CREATE TABLE "RemovedMarketingUsage" (
 "jobId" UUID PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "quotaPeriodStart" TIMESTAMP(3) NOT NULL,
 "quotaPeriodEnd" TIMESTAMP(3) NOT NULL,
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RemovedMarketingUsage_period_check" CHECK ("quotaPeriodEnd">"quotaPeriodStart")
);
CREATE INDEX "RemovedMarketingUsage_userId_quotaPeriodStart_idx" ON "RemovedMarketingUsage"("userId","quotaPeriodStart");
