ALTER TABLE "Feedback" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Feedback" ADD COLUMN "contactEmail" TEXT;
CREATE TABLE "SubmissionReceipt" (
 "id" TEXT NOT NULL PRIMARY KEY, "clientSubmissionId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "recordId" TEXT NOT NULL,
 "notificationStatus" TEXT NOT NULL DEFAULT 'PENDING', "notificationProviderId" TEXT,
 "notificationCheckedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SubmissionReceipt_clientSubmissionId_key" ON "SubmissionReceipt"("clientSubmissionId");
CREATE INDEX "SubmissionReceipt_createdAt_id_idx" ON "SubmissionReceipt"("createdAt", "id");
