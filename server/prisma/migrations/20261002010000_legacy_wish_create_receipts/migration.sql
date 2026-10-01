CREATE TABLE "LegacyWishCreateReceipt" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "clientRequestId" VARCHAR(36) NOT NULL,
  "kind" VARCHAR(8) NOT NULL,
  "wishlistId" INTEGER NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "state" VARCHAR(10) NOT NULL,
  "resourceId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyWishCreateReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LegacyWishCreateReceipt_userId_clientRequestId_key"
  ON "LegacyWishCreateReceipt"("userId", "clientRequestId");
ALTER TABLE "LegacyWishCreateReceipt" ADD CONSTRAINT "LegacyWishCreateReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
