CREATE TABLE "WishPhotoRemovalReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientUploadId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishPhotoRemovalReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WishPhotoRemovalReceipt_userId_clientUploadId_key"
    ON "WishPhotoRemovalReceipt"("userId", "clientUploadId");

ALTER TABLE "WishPhotoRemovalReceipt"
    ADD CONSTRAINT "WishPhotoRemovalReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
