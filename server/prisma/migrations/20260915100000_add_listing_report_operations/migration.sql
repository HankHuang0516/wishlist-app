CREATE TYPE "ListingReportOperationState" AS ENUM ('RECEIVED', 'ABANDONED');

CREATE TABLE "ListingReportOperation" (
    "reporterUserId" INTEGER NOT NULL,
    "clientReportId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" "ListingReportOperationState" NOT NULL,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingReportOperation_pkey" PRIMARY KEY ("reporterUserId", "clientReportId"),
    CONSTRAINT "ListingReportOperation_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "ListingReportOperation_abandoned_check" CHECK ("state" <> 'ABANDONED' OR "reportId" IS NULL)
);

CREATE UNIQUE INDEX "ListingReportOperation_reportId_key" ON "ListingReportOperation"("reportId");
ALTER TABLE "ListingReportOperation" ADD CONSTRAINT "ListingReportOperation_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingReportOperation" ADD CONSTRAINT "ListingReportOperation_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "ListingReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve already-accepted cases during upgrade. No evidence/profile copy.
INSERT INTO "ListingReportOperation" ("reporterUserId", "clientReportId", "requestHash", "state", "reportId", "createdAt")
SELECT "reporterUserId", "clientReportId", "requestHash", 'RECEIVED', "id", "createdAt" FROM "ListingReport";
