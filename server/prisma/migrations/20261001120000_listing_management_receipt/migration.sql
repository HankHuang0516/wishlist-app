CREATE TABLE "ListingManagementReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientActionId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(12) NOT NULL,
    "reason" VARCHAR(32),
    "appliedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingManagementReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ListingManagementReceipt_values" CHECK (
        "kind" IN ('EDIT','STATUS','EXTEND') AND "expectedVersion" > 0
        AND "requestHash" ~ '^[a-f0-9]{64}$'
        AND (("state" = 'APPLIED' AND "appliedVersion" IS NOT NULL AND "appliedVersion" = "expectedVersion" + 1 AND "reason" IS NULL)
          OR ("state" = 'CONFLICT' AND "appliedVersion" IS NULL AND "reason" IS NOT NULL AND "reason" IN ('LISTING_CONFLICT','INVALID_LISTING_INPUT','LISTING_ACCESS_DENIED'))
          OR ("state" = 'ABANDONED' AND "appliedVersion" IS NULL AND "reason" IS NULL))
    )
);
CREATE UNIQUE INDEX "ListingManagementReceipt_userId_clientActionId_key" ON "ListingManagementReceipt"("userId", "clientActionId");
ALTER TABLE "ListingManagementReceipt" ADD CONSTRAINT "ListingManagementReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
