CREATE TABLE "ExternalIntakeBatch" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "authorizationRef" TEXT NOT NULL,
  "sourceEnabledAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "itemCount" INTEGER NOT NULL,
  "observations" JSONB NOT NULL,
  CONSTRAINT "ExternalIntakeBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalIntakeBatch_itemCount_check" CHECK ("itemCount" BETWEEN 1 AND 50),
  CONSTRAINT "ExternalIntakeBatch_observations_check" CHECK (
    jsonb_typeof("observations") = 'array' AND jsonb_array_length("observations") = "itemCount"
  )
);

CREATE INDEX "ExternalIntakeBatch_sourceId_receivedAt_id_idx"
  ON "ExternalIntakeBatch"("sourceId", "receivedAt", "id");

ALTER TABLE "ExternalIntakeBatch" ADD CONSTRAINT "ExternalIntakeBatch_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ExternalListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
