CREATE TABLE "DiscoveryCpAttempt" (
    "id" TEXT NOT NULL,
    "runId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveryCpAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscoveryCpAttempt_createdAt_idx" ON "DiscoveryCpAttempt"("createdAt");
CREATE INDEX "DiscoveryCpAttempt_runId_idx" ON "DiscoveryCpAttempt"("runId");
ALTER TABLE "DiscoveryCpAttempt" ADD CONSTRAINT "DiscoveryCpAttempt_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "DiscoveryCpRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the known historical lower bound without pretending old retries
-- were counted. Every new provider attempt gets its own row thereafter.
INSERT INTO "DiscoveryCpAttempt" ("id", "runId", "createdAt")
SELECT 'legacy:' || "id", "id", "createdAt" FROM "DiscoveryCpRun";
