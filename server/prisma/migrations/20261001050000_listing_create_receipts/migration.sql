BEGIN;
-- Never silently discard an old key/hash or merge case-variant operations.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "Listing" WHERE "requestHash" !~ '^[a-f0-9]{64}$'
        OR "clientListingId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'Listing receipt migration requires valid legacy UUID keys and immutable hashes';
    END IF;
    IF EXISTS (SELECT 1 FROM "Listing" GROUP BY "ownerUserId", LOWER("clientListingId") HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Listing receipt migration requires resolution of legacy case-variant key collisions';
    END IF;
END $$;
CREATE TABLE "ListingCreateReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientListingId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "listingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingCreateReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ListingCreateReceipt_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "ListingCreateReceipt_state_check" CHECK (
        ("state" = 'CREATED' AND "listingId" IS NOT NULL) OR
        ("state" = 'ABANDONED' AND "listingId" IS NULL)
    ),
    CONSTRAINT "ListingCreateReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ListingCreateReceipt_userId_clientListingId_key" ON "ListingCreateReceipt"("userId", "clientListingId");
INSERT INTO "ListingCreateReceipt" ("id", "userId", "clientListingId", "requestHash", "state", "listingId", "createdAt")
SELECT "id", "ownerUserId", "clientListingId"::UUID, "requestHash", 'CREATED', "id"::UUID, "createdAt" FROM "Listing";
COMMIT;
