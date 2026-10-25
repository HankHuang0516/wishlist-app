-- Preserve unknown posting dates only for the separately bound Shopee
-- observation contract. Other published references keep their dated shape.
ALTER TABLE "ExternalSourceLead" DROP CONSTRAINT "SourceRecord_public_shape";
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_public_shape" CHECK (
 "status" <> 'PUBLISHED' OR (
  "sourceClaimState" = 'UNKNOWN' AND "checkedAt" IS NOT NULL
  AND (
   ("postedEarliestAt" IS NOT NULL AND "postedLatestAt" IS NOT NULL)
   OR COALESCE((
    "recordOrigin" = 'DB_MASTER'
    AND "postedEarliestAt" IS NULL AND "postedLatestAt" IS NULL
    AND "evidence"->>'locationType' = 'SELLER_CONTACT_REQUIRED'
    AND "evidence"->'observedListing'->>'provider' = 'SHOPEE'
    AND "evidence"->'observedListing'->>'availability' = 'VISIBLE_PURCHASE_CONTROL'
    AND "evidence"->'observedListing'->>'shopId' ~ '^[1-9][0-9]{0,19}$'
    AND "evidence"->'observedListing'->>'itemId' ~ '^[1-9][0-9]{0,19}$'
    AND (
     "canonicalUrl" = 'https://shopee.tw/product/' || ("evidence"->'observedListing'->>'shopId') || '/' || ("evidence"->'observedListing'->>'itemId')
     OR "canonicalUrl" ~ ('^https://shopee[.]tw/[^/?#]+-i[.]' || ("evidence"->'observedListing'->>'shopId') || '[.]' || ("evidence"->'observedListing'->>'itemId') || '$')
    )
    AND "archiveItemId" ~ ('^SP' || ("evidence"->'observedListing'->>'shopId') || '-' || ("evidence"->'observedListing'->>'itemId') || '-[0-9]{2}$')
    AND "evidence"->>'publicSourceRef' = 'source:shopee-item/' || ("evidence"->'observedListing'->>'shopId') || '.' || ("evidence"->'observedListing'->>'itemId')
    AND "evidence"->>'dateRef' = 'source:shopee-first-observed/' || ("evidence"->'observedListing'->>'shopId') || '.' || ("evidence"->'observedListing'->>'itemId')
    AND "evidence"->'publicFacts'->>'originalDateLabel' = '刊登日期未提供；首次查核 ' || ("evidence"->'observedListing'->>'firstObservedAt')
    AND CASE WHEN "evidence"->'observedListing'->>'firstObservedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
     THEN ("evidence"->'observedListing'->>'firstObservedAt')::timestamptz <= ("checkedAt" AT TIME ZONE 'UTC')
     ELSE FALSE END
   ),FALSE)
  )
  AND (
   ("county" IS NOT NULL AND "district" IS NOT NULL AND "publicPlaceName" IS NOT NULL AND "publicAddress" IS NOT NULL AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL)
   OR ("recordOrigin" = 'DB_MASTER' AND "county" IS NULL AND "district" IS NULL AND "publicPlaceName" IS NULL AND "publicAddress" IS NULL AND "latitude" IS NULL AND "longitude" IS NULL)
  )
  AND ("recordOrigin" = 'DB_MASTER' OR ("libraryFileId" IS NOT NULL AND "archiveVersion" IS NOT NULL AND "archiveSha256" IS NOT NULL))
 )
);
