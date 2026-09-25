ALTER TABLE "ListingMedia"
  ADD COLUMN "sellerDraft" JSONB,
  ADD COLUMN "sellerDraftVersion" INTEGER NOT NULL DEFAULT 0;
