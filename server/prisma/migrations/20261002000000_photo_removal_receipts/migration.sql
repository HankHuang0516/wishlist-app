CREATE TABLE "PhotoRemovalReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientActionId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(11) NOT NULL,
    "mediaId" UUID,
    "expectedVersion" INTEGER,
    "removedIds" UUID[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoRemovalReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhotoRemovalReceipt_hash" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "PhotoRemovalReceipt_ids" CHECK (array_position("removedIds", NULL) IS NULL),
    CONSTRAINT "PhotoRemovalReceipt_state" CHECK (
        ("state" = 'ABANDONED' AND "mediaId" IS NULL AND "expectedVersion" IS NULL AND cardinality("removedIds") = 0) OR
        ("state" IN ('REMOVED','CONFLICT','UNAVAILABLE') AND "mediaId" IS NOT NULL AND "expectedVersion" IS NOT NULL AND "expectedVersion" BETWEEN 0 AND 1000000 AND
            (("state" = 'REMOVED' AND "mediaId" = ANY("removedIds")) OR ("state" <> 'REMOVED' AND cardinality("removedIds") = 0)))
    )
);
CREATE UNIQUE INDEX "PhotoRemovalReceipt_userId_clientActionId_key" ON "PhotoRemovalReceipt"("userId","clientActionId");
ALTER TABLE "PhotoRemovalReceipt" ADD CONSTRAINT "PhotoRemovalReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
