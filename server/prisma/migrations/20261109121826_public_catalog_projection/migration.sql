-- CreateTable
CREATE TABLE "PublicCatalogEntry" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "kindRank" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "visibleUntil" TIMESTAMP(3),
    "refreshAt" TIMESTAMP(3),
    "product" JSONB NOT NULL,
    "mapLocation" JSONB,
    "mapVisibleUntil" TIMESTAMP(3),
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "searchText" TEXT NOT NULL,
    "mainId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "county" TEXT,
    "price" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "thumbnailUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCatalogEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PublicCatalogDirty" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCatalogDirty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCatalogState" (
    "id" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "readyAt" TIMESTAMP(3),
    "version" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCatalogState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicCatalogEntry_kind_visible_idx" ON "PublicCatalogEntry"("kind", "visible");

-- CreateIndex
CREATE INDEX "PublicCatalogEntry_date_key_idx" ON "PublicCatalogEntry"("date", "key");

-- CreateIndex
CREATE INDEX "PublicCatalogEntry_refreshAt_idx" ON "PublicCatalogEntry"("refreshAt");

-- CreateIndex
CREATE INDEX "PublicCatalogEntry_mainId_subId_idx" ON "PublicCatalogEntry"("mainId", "subId");

-- CreateIndex
CREATE INDEX "PublicCatalogDirty_priority_id_idx" ON "PublicCatalogDirty"("priority", "id");

-- Mark every changed source row in the same transaction as the change, whatever
-- wrote it (API, script or console). publicCatalog.ts rebuilds the marked rows.
CREATE FUNCTION public_catalog_mark() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'Listing' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('listing', OLD."id");
    ELSE
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('listing', NEW."id");
    END IF;
  ELSIF TG_TABLE_NAME = 'ListingMedia' OR TG_TABLE_NAME = 'ListingLocation' THEN
    IF TG_OP <> 'INSERT' THEN
      IF OLD."listingId" IS NOT NULL THEN
        INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('listing', OLD."listingId");
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      IF NEW."listingId" IS NOT NULL THEN
        INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('listing', NEW."listingId");
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ExternalSourceLead' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('source', OLD."id");
    ELSE
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('source', NEW."id");
    END IF;
  ELSIF TG_TABLE_NAME = 'ExternalListingCandidate' THEN
    IF TG_OP = 'DELETE' THEN
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('external', OLD."id");
    ELSE
      INSERT INTO "PublicCatalogDirty" ("kind", "refId") VALUES ('external', NEW."id");
    END IF;
  ELSIF TG_TABLE_NAME = 'ExternalListingSource' THEN
    -- A source's authorization decides whether each of its candidates is public.
    INSERT INTO "PublicCatalogDirty" ("kind", "refId")
      SELECT 'external', c."id" FROM "ExternalListingCandidate" c WHERE c."sourceId" = NEW."id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER public_catalog_mark AFTER INSERT OR UPDATE OR DELETE ON "Listing"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
CREATE TRIGGER public_catalog_mark AFTER INSERT OR UPDATE OR DELETE ON "ListingMedia"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
CREATE TRIGGER public_catalog_mark AFTER INSERT OR UPDATE OR DELETE ON "ListingLocation"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
CREATE TRIGGER public_catalog_mark AFTER INSERT OR UPDATE OR DELETE ON "ExternalSourceLead"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
CREATE TRIGGER public_catalog_mark AFTER INSERT OR UPDATE OR DELETE ON "ExternalListingCandidate"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
CREATE TRIGGER public_catalog_mark AFTER UPDATE ON "ExternalListingSource"
  FOR EACH ROW EXECUTE FUNCTION public_catalog_mark();
