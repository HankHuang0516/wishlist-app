CREATE TYPE "ExternalSourceKind" AS ENUM ('PARTNER_FEED', 'LINE_OPT_IN', 'SELLER_IMPORT');
CREATE TYPE "ExternalCandidateStatus" AS ENUM ('PENDING_REVIEW', 'REJECTED', 'STALE');

CREATE TABLE "ExternalListingSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "ExternalSourceKind" NOT NULL,
  "canonicalHost" TEXT NOT NULL,
  "imageHost" TEXT,
  "authorizationRef" TEXT NOT NULL,
  "textReuseAllowed" BOOLEAN NOT NULL DEFAULT false,
  "imageReuseAllowed" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "enabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalListingSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalListingCandidate" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceItemId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "imageUrl" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priceTwd" DECIMAL(12,2),
  "condition" "ListingCondition" NOT NULL,
  "county" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentHash" TEXT NOT NULL,
  "status" "ExternalCandidateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalListingCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalListingSource_enabled_kind_idx" ON "ExternalListingSource"("enabled", "kind");
CREATE UNIQUE INDEX "ExternalListingCandidate_sourceId_sourceItemId_key" ON "ExternalListingCandidate"("sourceId", "sourceItemId");
CREATE INDEX "ExternalListingCandidate_status_expiresAt_idx" ON "ExternalListingCandidate"("status", "expiresAt");
CREATE INDEX "ExternalListingCandidate_sourceId_lastSeenAt_idx" ON "ExternalListingCandidate"("sourceId", "lastSeenAt");
ALTER TABLE "ExternalListingCandidate" ADD CONSTRAINT "ExternalListingCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
