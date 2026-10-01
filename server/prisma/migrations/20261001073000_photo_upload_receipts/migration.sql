BEGIN;
-- Old rows do not retain the original upload bytes. Never invent their source
-- hashes; new uploads and positively verified legacy retries create receipts.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "ListingMedia" WHERE "clientUploadId" IS NOT NULL
        AND "clientUploadId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'Photo upload receipt migration requires valid legacy UUID keys';
    END IF;
    IF EXISTS (SELECT 1 FROM "ListingMedia" WHERE "clientUploadId" IS NOT NULL
        GROUP BY "ownerUserId", LOWER("clientUploadId") HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Photo upload receipt migration requires resolution of legacy case-variant collisions';
    END IF;
END $$;
CREATE TABLE "PhotoUploadReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientUploadId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "mediaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoUploadReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhotoUploadReceipt_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "PhotoUploadReceipt_state_check" CHECK (
        ("state" = 'STORED' AND "mediaId" IS NOT NULL) OR
        ("state" = 'ABANDONED' AND "mediaId" IS NULL)
    ),
    CONSTRAINT "PhotoUploadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PhotoUploadReceipt_userId_clientUploadId_key" ON "PhotoUploadReceipt"("userId", "clientUploadId");
COMMIT;
