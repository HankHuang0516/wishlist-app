-- Structure only. No archive ingestion, record updates, deletion or backfill.
ALTER TABLE "ExternalSourceLead"
  ADD COLUMN "sourceClaimState" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "recordOrigin" TEXT NOT NULL DEFAULT 'ARCHIVE',
  ADD COLUMN "recordRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "pendingFacts" JSONB,
  ADD COLUMN "pendingHash" TEXT;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "libraryFileId" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "archiveVersion" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "archiveSha256" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "county" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "district" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "publicPlaceName" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "publicAddress" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "postedEarliestAt" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "postedLatestAt" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "checkedAt" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_claim" CHECK ("sourceClaimState" IN ('UNKNOWN','RESERVED','SOLD','WITHDRAWN'));
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_origin" CHECK ("recordOrigin" IN ('ARCHIVE','DB_MASTER'));
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_revision" CHECK ("recordRevision" >= 1);
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_public_shape" CHECK (
 "status" <> 'PUBLISHED' OR (
 "county" IS NOT NULL AND "district" IS NOT NULL AND "publicPlaceName" IS NOT NULL AND "publicAddress" IS NOT NULL AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "postedEarliestAt" IS NOT NULL AND "postedLatestAt" IS NOT NULL AND "checkedAt" IS NOT NULL
 AND ("recordOrigin" = 'DB_MASTER' OR ("libraryFileId" IS NOT NULL AND "archiveVersion" IS NOT NULL AND "archiveSha256" IS NOT NULL))
 ));
CREATE TABLE "SourceLeadRecordEvent" (
 "id" TEXT NOT NULL, "leadId" TEXT NOT NULL, "operationId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "appliedRevision" INTEGER NOT NULL,
 "beforeSnapshot" JSONB, "afterSnapshot" JSONB NOT NULL,
 "sourceCheckRef" TEXT, "sourceCheckedAt" TIMESTAMP(3), "sourceUrl" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SourceLeadRecordEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SourceLeadRecordEvent_operationId_leadId_key" ON "SourceLeadRecordEvent"("operationId","leadId");
CREATE INDEX "SourceLeadRecordEvent_leadId_createdAt_id_idx" ON "SourceLeadRecordEvent"("leadId","createdAt","id");
CREATE INDEX "SourceLeadRecordEvent_sourceCheckRef_idx" ON "SourceLeadRecordEvent"("sourceCheckRef");
ALTER TABLE "SourceLeadRecordEvent" ADD CONSTRAINT "SourceLeadRecordEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ExternalSourceLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
