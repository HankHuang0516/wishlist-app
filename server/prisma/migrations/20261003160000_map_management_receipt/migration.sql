ALTER TABLE "ListingManagementReceipt" ADD COLUMN "mapVisibleUntil" TIMESTAMP(3);
ALTER TABLE "ListingManagementReceipt" DROP CONSTRAINT "ListingManagementReceipt_values";
ALTER TABLE "ListingManagementReceipt" ADD CONSTRAINT "ListingManagementReceipt_values" CHECK (
    "kind" IN ('EDIT','STATUS','EXTEND','MAP') AND "expectedVersion" > 0
    AND "requestHash" ~ '^[a-f0-9]{64}$'
    AND (("state" = 'APPLIED' AND "appliedVersion" IS NOT NULL AND "appliedVersion" = "expectedVersion" + 1 AND "reason" IS NULL)
      OR ("state" = 'CONFLICT' AND "appliedVersion" IS NULL AND "reason" IS NOT NULL AND "reason" IN ('LISTING_CONFLICT','INVALID_LISTING_INPUT','LISTING_ACCESS_DENIED'))
      OR ("state" = 'ABANDONED' AND "appliedVersion" IS NULL AND "reason" IS NULL))
    AND ("mapVisibleUntil" IS NULL OR ("kind" = 'MAP' AND "state" = 'APPLIED'))
);
