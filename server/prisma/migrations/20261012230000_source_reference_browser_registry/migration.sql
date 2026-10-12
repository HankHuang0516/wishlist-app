-- Additive authorization/audit only. Existing session scopes and evidence remain unchanged.
ALTER TABLE "SourceManagerSession" DROP CONSTRAINT "SourceManagerSession_scope";
ALTER TABLE "SourceManagerSession" ADD CONSTRAINT "SourceManagerSession_scope" CHECK ("scope" IN ('SOURCE_DRAFT_EDITOR','SOURCE_REFERENCE_AUTO_DISPLAY','SOURCE_REFERENCE_EVIDENCE_VERIFIER'));
ALTER TABLE "SourceReferenceEvidence" DROP CONSTRAINT "SourceReferenceEvidence_issuer";
ALTER TABLE "SourceReferenceEvidence" ADD CONSTRAINT "SourceReferenceEvidence_issuer" CHECK ("issuer" IN ('EXISTING_SOURCE_ADMIN','SOURCE_SESSION_VERIFIER'));
ALTER TABLE "SourceReferenceEvidence" ADD COLUMN "coordinateReadUrl" TEXT;
ALTER TABLE "SourceReferenceEvidence" ADD COLUMN "coordinateReadReceiptRef" TEXT;
CREATE TABLE "SourceReferenceRegistration" (
 "operationId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "actorSessionId" TEXT NOT NULL, "actorScope" TEXT NOT NULL,
 "results" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SourceReferenceRegistration_pkey" PRIMARY KEY ("operationId"),
 CONSTRAINT "SourceReferenceRegistration_scope" CHECK ("actorScope"='SOURCE_REFERENCE_EVIDENCE_VERIFIER'),
 CONSTRAINT "SourceReferenceRegistration_hash" CHECK ("requestHash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "SourceReferenceRegistration_actorSessionId_createdAt_idx" ON "SourceReferenceRegistration"("actorSessionId","createdAt");
