-- Preserve all existing records. Nullable references allow physical account
-- erasure without destroying another participant's authored messages or ledger.
ALTER TABLE "Conversation" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ALTER COLUMN "listingId" DROP NOT NULL;
ALTER TABLE "Conversation" ALTER COLUMN "buyerUserId" DROP NOT NULL;
ALTER TABLE "Conversation" ALTER COLUMN "sellerUserId" DROP NOT NULL;
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_listingId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_buyerUserId_fkey";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_sellerUserId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_userId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "MediaErasureTask" (
    "mediaId" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaErasureTask_pkey" PRIMARY KEY ("mediaId")
);
CREATE TABLE "AccountErasureReceipt" (
    "id" TEXT NOT NULL,
    "identityHash" VARCHAR(64) NOT NULL,
    "clientActionId" UUID NOT NULL,
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountErasureReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountErasureReceipt_identityHash_clientActionId_key" ON "AccountErasureReceipt"("identityHash", "clientActionId");
CREATE INDEX "AccountErasureReceipt_erasedAt_idx" ON "AccountErasureReceipt"("erasedAt");
