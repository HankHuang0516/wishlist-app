CREATE TYPE "ListingReportReason" AS ENUM ('PROHIBITED', 'FRAUD', 'HARASSMENT', 'SPAM', 'OTHER');
CREATE TYPE "ListingReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'REMOVED');
CREATE TYPE "ListingModerationDecision" AS ENUM ('DISMISS', 'REMOVE_LISTING');

CREATE TABLE "ListingReport" (
  "id" TEXT NOT NULL,
  "reporterUserId" INTEGER NOT NULL,
  "listingId" TEXT NOT NULL,
  "clientReportId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "reason" "ListingReportReason" NOT NULL,
  "details" TEXT,
  "status" "ListingReportStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ListingModerationAction" (
  "id" TEXT NOT NULL,
  "reportId" TEXT,
  "listingId" TEXT NOT NULL,
  "clientDecisionId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "decision" "ListingModerationDecision" NOT NULL,
  "notes" TEXT NOT NULL,
  "actorKeyRef" TEXT NOT NULL,
  "expectedReportVersion" INTEGER NOT NULL CHECK ("expectedReportVersion" > 0),
  "expectedListingVersion" INTEGER CHECK ("expectedListingVersion" > 0),
  "listingStatusBefore" "ListingStatus" NOT NULL,
  "listingVersionBefore" INTEGER NOT NULL CHECK ("listingVersionBefore" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingModerationAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ListingReport_reporterUserId_clientReportId_key" ON "ListingReport"("reporterUserId", "clientReportId");
CREATE INDEX "ListingReport_status_createdAt_id_idx" ON "ListingReport"("status", "createdAt", "id");
CREATE INDEX "ListingReport_reporterUserId_createdAt_id_idx" ON "ListingReport"("reporterUserId", "createdAt", "id");
CREATE INDEX "ListingReport_listingId_idx" ON "ListingReport"("listingId");
CREATE UNIQUE INDEX "ListingModerationAction_clientDecisionId_key" ON "ListingModerationAction"("clientDecisionId");
CREATE INDEX "ListingModerationAction_reportId_createdAt_idx" ON "ListingModerationAction"("reportId", "createdAt");
CREATE INDEX "ListingModerationAction_listingId_createdAt_idx" ON "ListingModerationAction"("listingId", "createdAt");
ALTER TABLE "ListingReport" ADD CONSTRAINT "ListingReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingReport" ADD CONSTRAINT "ListingReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingModerationAction" ADD CONSTRAINT "ListingModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ListingReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ListingModerationAction" ADD CONSTRAINT "ListingModerationAction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
