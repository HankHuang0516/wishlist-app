CREATE TABLE "ProductWishLink" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "productKey" VARCHAR(80) NOT NULL,
  "itemId" INTEGER REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductWishLink_userId_productKey_key" ON "ProductWishLink"("userId", "productKey");
CREATE INDEX "ProductWishLink_itemId_idx" ON "ProductWishLink"("itemId");
CREATE TABLE "ProductWishReceipt" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientRequestId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "itemId" INTEGER REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "wishlistId" INTEGER NOT NULL,
  "productKey" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductWishReceipt_userId_clientRequestId_key" ON "ProductWishReceipt"("userId", "clientRequestId");
CREATE INDEX "ProductWishReceipt_itemId_idx" ON "ProductWishReceipt"("itemId");
