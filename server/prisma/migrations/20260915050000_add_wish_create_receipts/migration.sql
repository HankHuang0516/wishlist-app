CREATE TABLE "WishCreateReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishCreateReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WishCreateReceipt_userId_clientRequestId_key" ON "WishCreateReceipt"("userId", "clientRequestId");
ALTER TABLE "WishCreateReceipt" ADD CONSTRAINT "WishCreateReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
