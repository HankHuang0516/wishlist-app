-- Existing listings remain off the map until their owner explicitly checks in.
ALTER TABLE "Listing" ADD COLUMN "mapVisibleUntil" TIMESTAMP(3);
CREATE INDEX "Listing_mapVisibleUntil_idx" ON "Listing"("mapVisibleUntil");
