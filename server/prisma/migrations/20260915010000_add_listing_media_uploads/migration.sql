ALTER TABLE "ListingMedia" ADD COLUMN "clientUploadId" TEXT,
    ADD COLUMN "width" INTEGER,
    ADD COLUMN "height" INTEGER,
    ADD COLUMN "byteSize" INTEGER;
CREATE UNIQUE INDEX "ListingMedia_ownerUserId_clientUploadId_key" ON "ListingMedia"("ownerUserId", "clientUploadId");
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_positive_dimensions" CHECK (
  ("width" IS NULL OR "width" BETWEEN 1 AND 1600) AND
  ("height" IS NULL OR "height" BETWEEN 1 AND 1600) AND
  ("byteSize" IS NULL OR "byteSize" > 0)
);
