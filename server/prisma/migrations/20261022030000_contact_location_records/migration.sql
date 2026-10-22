-- Structure only. A published DB_MASTER record may carry no region at all (seller contact required);
-- location fields must then be all null. No record updates, deletion or backfill.
ALTER TABLE "ExternalSourceLead" DROP CONSTRAINT "SourceRecord_public_shape";
ALTER TABLE "ExternalSourceLead" ADD CONSTRAINT "SourceRecord_public_shape" CHECK (
 "status" <> 'PUBLISHED' OR (
 "sourceClaimState" = 'UNKNOWN' AND
 "postedEarliestAt" IS NOT NULL AND "postedLatestAt" IS NOT NULL AND "checkedAt" IS NOT NULL
 AND (
  ("county" IS NOT NULL AND "district" IS NOT NULL AND "publicPlaceName" IS NOT NULL AND "publicAddress" IS NOT NULL AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL)
  OR ("recordOrigin" = 'DB_MASTER' AND "county" IS NULL AND "district" IS NULL AND "publicPlaceName" IS NULL AND "publicAddress" IS NULL AND "latitude" IS NULL AND "longitude" IS NULL)
 )
 AND ("recordOrigin" = 'DB_MASTER' OR ("libraryFileId" IS NOT NULL AND "archiveVersion" IS NOT NULL AND "archiveSha256" IS NOT NULL))
 ));
