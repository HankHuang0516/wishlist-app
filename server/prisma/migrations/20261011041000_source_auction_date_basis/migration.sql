-- No record update/backfill; auction dates must never masquerade as publication.
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "postedEarliestAt" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ALTER COLUMN "postedLatestAt" DROP NOT NULL;
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceLead_date_basis" CHECK (COALESCE((
  (NOT ("evidence" ? 'officialAuction') AND "postedEarliestAt" IS NOT NULL AND "postedLatestAt" IS NOT NULL)
  OR (
    "evidence"->'officialAuction'->>'sourceType' = 'OFFICIAL_AUCTION'
    AND "evidence"->'officialAuction'->>'dateBasis' = 'ACTIVE_AUCTION_WINDOW'
    AND "evidence"->'officialAuction'->>'priceType' = 'STARTING_BID'
    AND "evidence"->'officialAuction'->'originalPublishedAt' = 'null'::jsonb
    AND "postedEarliestAt" IS NULL AND "postedLatestAt" IS NULL
  )
), FALSE));
