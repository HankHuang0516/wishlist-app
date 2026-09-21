ALTER TABLE "AccountErasureReceipt" ALTER COLUMN "erasedAt" DROP NOT NULL;
ALTER TABLE "AccountErasureReceipt" ALTER COLUMN "erasedAt" DROP DEFAULT;
ALTER TABLE "AccountErasureReceipt" ADD COLUMN "abandoned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountErasureReceipt" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "AccountErasureReceipt" SET "createdAt" = "erasedAt" WHERE "erasedAt" IS NOT NULL;
ALTER TABLE "AccountErasureReceipt" ADD CONSTRAINT "AccountErasureReceipt_state" CHECK (
  ("abandoned" AND "erasedAt" IS NULL) OR (NOT "abandoned" AND "erasedAt" IS NOT NULL)
);
ALTER TABLE "MediaErasureTask" ADD COLUMN "identityHash" VARCHAR(64);
ALTER TABLE "MediaErasureTask" ADD COLUMN "clientActionId" UUID;
CREATE INDEX "MediaErasureTask_identityHash_clientActionId_idx" ON "MediaErasureTask"("identityHash", "clientActionId");
CREATE TABLE "LegacyAssetErasureTask" (
  "id" TEXT NOT NULL,
  "identityHash" VARCHAR(64) NOT NULL,
  "clientActionId" UUID NOT NULL,
  "kind" VARCHAR(12) NOT NULL,
  "target" VARCHAR(180) NOT NULL,
  "resourceType" VARCHAR(12) NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyAssetErasureTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegacyAssetErasureTask_identityHash_clientActionId_idx" ON "LegacyAssetErasureTask"("identityHash", "clientActionId");
