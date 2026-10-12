-- Restricted browser sessions only. No inventory/record changes.
CREATE TABLE "SourceManagerSession" (
 "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "scope" TEXT NOT NULL DEFAULT 'SOURCE_DRAFT_EDITOR',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "SourceManagerSession_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SourceManagerSession_hash" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "SourceManagerSession_scope" CHECK ("scope" = 'SOURCE_DRAFT_EDITOR'),
 CONSTRAINT "SourceManagerSession_expiry" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '90 days' + INTERVAL '1 minute')
);
CREATE UNIQUE INDEX "SourceManagerSession_tokenHash_key" ON "SourceManagerSession"("tokenHash");
CREATE INDEX "SourceManagerSession_scope_revokedAt_idx" ON "SourceManagerSession"("scope","revokedAt");
CREATE INDEX "SourceManagerSession_expiresAt_idx" ON "SourceManagerSession"("expiresAt");
