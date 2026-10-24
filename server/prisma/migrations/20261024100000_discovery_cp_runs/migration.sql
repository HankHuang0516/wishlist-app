CREATE TABLE "DiscoveryCpRun" (
  "id" VARCHAR(64) NOT NULL,
  "model" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryCpRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscoveryCpRun_state_expiresAt_idx" ON "DiscoveryCpRun"("state", "expiresAt");
CREATE INDEX "DiscoveryCpRun_createdAt_idx" ON "DiscoveryCpRun"("createdAt");
