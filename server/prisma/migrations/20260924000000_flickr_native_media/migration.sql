ALTER TABLE "ListingMedia"
  ADD COLUMN "flickrPhotoId" TEXT,
  ADD COLUMN "flickrImageUrl" TEXT,
  ADD COLUMN "flickrThumbnailUrl" TEXT;

ALTER TABLE "MediaErasureTask"
  ADD COLUMN "flickrPhotoId" TEXT;

ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_flickr_fields_together" CHECK (
  ("flickrPhotoId" IS NULL AND "flickrImageUrl" IS NULL AND "flickrThumbnailUrl" IS NULL)
  OR ("flickrPhotoId" ~ '^[0-9]{1,30}$' AND "flickrImageUrl" IS NOT NULL AND "flickrThumbnailUrl" IS NOT NULL)
);

ALTER TABLE "MediaErasureTask" ADD CONSTRAINT "MediaErasureTask_flickr_photo_id" CHECK (
  "flickrPhotoId" IS NULL OR "flickrPhotoId" ~ '^[0-9]{1,30}$'
);
