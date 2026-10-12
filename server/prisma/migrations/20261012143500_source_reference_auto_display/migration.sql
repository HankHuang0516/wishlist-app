-- Additive evidence/scope contract. Never upgrade existing sessions or records.
ALTER TABLE "SourceManagerSession" DROP CONSTRAINT "SourceManagerSession_scope";
ALTER TABLE "SourceManagerSession" ADD CONSTRAINT "SourceManagerSession_scope" CHECK ("scope" IN ('SOURCE_DRAFT_EDITOR','SOURCE_REFERENCE_AUTO_DISPLAY'));
ALTER TABLE "ExternalSourceLead" ADD COLUMN "pendingEvidenceRef" TEXT;
CREATE TABLE "SourceReferenceEvidence" (
 "id" TEXT NOT NULL,"receiptRef" TEXT NOT NULL,"archiveItemId" TEXT NOT NULL,"canonicalUrl" TEXT NOT NULL,
 "checkedAt" TIMESTAMP(3) NOT NULL,"sourceCheckRef" TEXT NOT NULL,"factsHash" TEXT NOT NULL,"facts" JSONB NOT NULL,
 "materialSha" TEXT NOT NULL,"coordinateSha" TEXT,"verified" BOOLEAN NOT NULL,"issues" JSONB NOT NULL,"issuer" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SourceReferenceEvidence_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SourceReferenceEvidence_issuer" CHECK ("issuer"='EXISTING_SOURCE_ADMIN'),
 CONSTRAINT "SourceReferenceEvidence_hash" CHECK ("factsHash" ~ '^[a-f0-9]{64}$' AND "materialSha" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "SourceReferenceEvidence_receiptRef_key" ON "SourceReferenceEvidence"("receiptRef");
CREATE INDEX "SourceReferenceEvidence_archiveItemId_createdAt_idx" ON "SourceReferenceEvidence"("archiveItemId","createdAt");
CREATE INDEX "SourceReferenceEvidence_sourceCheckRef_idx" ON "SourceReferenceEvidence"("sourceCheckRef");
