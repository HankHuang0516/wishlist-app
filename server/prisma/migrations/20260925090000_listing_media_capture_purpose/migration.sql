CREATE TYPE "ListingMediaPurpose" AS ENUM ('LEGACY_UNKNOWN', 'MANUAL_PHOTO', 'BATCH_ITEM');

ALTER TABLE "ListingMedia" ADD COLUMN "capturePurpose" "ListingMediaPurpose" NOT NULL DEFAULT 'LEGACY_UNKNOWN';

-- Older batch uploads can be identified only after they queued AI or saved a
-- seller edit. Keep genuinely ambiguous uploads in LEGACY_UNKNOWN instead of
-- silently treating multi-angle manual photos as separate products.
UPDATE "ListingMedia" SET "capturePurpose" = 'BATCH_ITEM'
WHERE "listingId" IS NULL AND "wishItemId" IS NULL
  AND ("sellerDraft" IS NOT NULL OR "aiDraftStatus" <> 'SKIPPED');

CREATE INDEX "ListingMedia_ownerUserId_capturePurpose_createdAt_idx"
ON "ListingMedia"("ownerUserId", "capturePurpose", "createdAt");
