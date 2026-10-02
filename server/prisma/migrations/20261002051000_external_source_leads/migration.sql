-- Additive isolated source-lead model: no Listing writes or inventory backfill.
CREATE TABLE "ExternalSourceLead" (
 "id" TEXT NOT NULL,
 "archiveItemId" TEXT NOT NULL,
 "libraryFileId" TEXT NOT NULL,
 "archiveVersion" INTEGER NOT NULL,
 "archiveSha256" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "summary" TEXT NOT NULL,
 "canonicalUrl" TEXT NOT NULL,
 "county" TEXT NOT NULL,
 "district" TEXT NOT NULL,
 "publicPlaceName" TEXT NOT NULL,
 "publicAddress" TEXT NOT NULL,
 "latitude" DOUBLE PRECISION NOT NULL,
 "longitude" DOUBLE PRECISION NOT NULL,
 "postedEarliestAt" TIMESTAMP(3) NOT NULL,
 "postedLatestAt" TIMESTAMP(3) NOT NULL,
 "checkedAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
 "evidence" JSONB NOT NULL,
 "sellerRoute" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ExternalSourceLead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SourceLeadInquiry" (
 "id" TEXT NOT NULL,
 "leadId" TEXT NOT NULL,
 "buyerUserId" INTEGER NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'INQUIRY',
 "leadContentHash" TEXT NOT NULL,
 "events" JSONB NOT NULL DEFAULT '[]',
 "consentHash" TEXT,
 "delivery" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SourceLeadInquiry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExternalSourceLead_archiveItemId_key" ON "ExternalSourceLead"("archiveItemId");
CREATE INDEX "ExternalSourceLead_status_id_idx" ON "ExternalSourceLead"("status", "id");
CREATE UNIQUE INDEX "SourceLeadInquiry_leadId_buyerUserId_key" ON "SourceLeadInquiry"("leadId", "buyerUserId");
ALTER TABLE "SourceLeadInquiry" ADD CONSTRAINT "SourceLeadInquiry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ExternalSourceLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceLeadInquiry" ADD CONSTRAINT "SourceLeadInquiry_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceLead_range" CHECK (latitude BETWEEN 20 AND 26.6 AND longitude BETWEEN 117 AND 123.8 AND "postedEarliestAt" <= "postedLatestAt");
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceLead_status" CHECK (status IN ('PUBLISHED','WITHDRAWN'));
