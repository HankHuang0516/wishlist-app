ALTER TABLE "User" ADD COLUMN "followingVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_followingVersion_nonnegative" CHECK ("followingVersion" >= 0);
CREATE TABLE "FollowOperationReceipt" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "clientActionId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "targetUserId" INTEGER,
  "wanted" BOOLEAN,
  "expectedVersion" INTEGER,
  "state" VARCHAR(16) NOT NULL,
  "appliedVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowOperationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FollowOperationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowOperationReceipt_hash" CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "FollowOperationReceipt_state" CHECK (
    ("state"='ABANDONED' AND "targetUserId" IS NULL AND "wanted" IS NULL AND "expectedVersion" IS NULL AND "appliedVersion" IS NULL) OR
    ("state" IN ('APPLIED','CONFLICT','LIMIT','UNAVAILABLE') AND "targetUserId" IS NOT NULL AND "targetUserId">0 AND "targetUserId"<>"userId" AND "wanted" IS NOT NULL AND "expectedVersion" IS NOT NULL AND "expectedVersion">=0 AND "expectedVersion"<2147483647 AND
      (("state"='APPLIED' AND "appliedVersion" IS NOT NULL AND "appliedVersion"="expectedVersion"+1) OR ("state"<>'APPLIED' AND "appliedVersion" IS NULL)))
  )
);
CREATE UNIQUE INDEX "FollowOperationReceipt_userId_clientActionId_key" ON "FollowOperationReceipt"("userId","clientActionId");
