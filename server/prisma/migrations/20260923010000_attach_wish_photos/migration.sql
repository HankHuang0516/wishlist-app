ALTER TABLE "ListingMedia" ADD COLUMN "wishItemId" INTEGER;
CREATE UNIQUE INDEX "ListingMedia_wishItemId_key" ON "ListingMedia"("wishItemId");
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_wishItemId_fkey" FOREIGN KEY ("wishItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_one_owner_target" CHECK ("listingId" IS NULL OR "wishItemId" IS NULL);
