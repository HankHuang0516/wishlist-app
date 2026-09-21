-- Additive marketplace foundation. Existing wishlist/item data is untouched.
CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'USED');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED');
CREATE TYPE "ListingDeliveryMethod" AS ENUM ('MEETUP', 'SHIPPING');
CREATE TYPE "ListingExpiryMode" AS ENUM ('DEFAULT_30_DAYS', 'CUSTOM_DATE');
ALTER TABLE "User" ADD COLUMN "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "clientListingId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "condition" "ListingCondition" NOT NULL DEFAULT 'USED',
    "category" TEXT,
    "brand" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "deliveryMethods" "ListingDeliveryMethod"[] DEFAULT ARRAY[]::"ListingDeliveryMethod"[],
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "expiryMode" "ListingExpiryMode" NOT NULL DEFAULT 'DEFAULT_30_DAYS',
    "lastVerifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "listingId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ListingLocation" (
    "listingId" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "publicLatitude" DOUBLE PRECISION NOT NULL,
    "publicLongitude" DOUBLE PRECISION NOT NULL,
    "precisionMeters" INTEGER NOT NULL DEFAULT 2200,
    CONSTRAINT "ListingLocation_pkey" PRIMARY KEY ("listingId")
);
CREATE INDEX "Listing_status_expiresAt_idx" ON "Listing"("status", "expiresAt");
CREATE INDEX "Listing_ownerUserId_createdAt_idx" ON "Listing"("ownerUserId", "createdAt");
CREATE INDEX "Listing_createdAt_id_idx" ON "Listing"("createdAt", "id");
CREATE UNIQUE INDEX "Listing_ownerUserId_clientListingId_key" ON "Listing"("ownerUserId", "clientListingId");
CREATE INDEX "ListingMedia_listingId_position_idx" ON "ListingMedia"("listingId", "position");
CREATE INDEX "ListingMedia_ownerUserId_createdAt_idx" ON "ListingMedia"("ownerUserId", "createdAt");
CREATE INDEX "ListingLocation_publicLatitude_publicLongitude_idx" ON "ListingLocation"("publicLatitude", "publicLongitude");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ListingLocation" ADD CONSTRAINT "ListingLocation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth for rows written outside the HTTP parser.
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_version_positive" CHECK ("version" > 0);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_publication_expiry" CHECK (
  "status" NOT IN ('ACTIVE', 'RESERVED') OR
  ("publishedAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "publishedAt")
);
ALTER TABLE "ListingLocation" ADD CONSTRAINT "ListingLocation_public_bounds" CHECK (
  "publicLatitude" BETWEEN 20 AND 26.6 AND "publicLongitude" BETWEEN 117 AND 123.8 AND "precisionMeters" >= 1000
);
