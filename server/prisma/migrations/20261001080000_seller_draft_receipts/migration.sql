BEGIN;
CREATE TABLE "SellerDraftReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientActionId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "appliedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerDraftReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SellerDraftReceipt_hash_check" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "SellerDraftReceipt_state_check" CHECK (
        ("state" = 'APPLIED' AND "appliedVersion" IS NOT NULL AND "appliedVersion" BETWEEN 1 AND 1000001)
        OR ("state" IN ('CONFLICT', 'ABANDONED') AND "appliedVersion" IS NULL)
    )
);
CREATE UNIQUE INDEX "SellerDraftReceipt_userId_clientActionId_key" ON "SellerDraftReceipt"("userId", "clientActionId");
ALTER TABLE "SellerDraftReceipt" ADD CONSTRAINT "SellerDraftReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- No media FK: deleting a photo must not release the original save/cancel key.
-- Existing legacy PUTs have no client action ID; do not invent old receipts.
COMMIT;
