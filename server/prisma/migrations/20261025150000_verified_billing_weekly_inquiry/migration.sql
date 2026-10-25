ALTER TABLE "User"
  ADD COLUMN "billingAccountToken" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "inquiryWeekStart" TIMESTAMP(3),
  ADD COLUMN "inquiryFreeUsed" INTEGER NOT NULL DEFAULT 0 CHECK ("inquiryFreeUsed" BETWEEN 0 AND 3);
CREATE UNIQUE INDEX "User_billingAccountToken_key" ON "User"("billingAccountToken");
ALTER TABLE "Purchase"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "environment" TEXT,
  ADD COLUMN "accountBinding" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "creditUnits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "creditRemaining" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verificationData" JSONB,
  ADD CONSTRAINT "Purchase_credit_balance" CHECK ("creditRemaining" >= 0 AND "creditRemaining" <= "creditUnits");
CREATE UNIQUE INDEX "Purchase_providerReference_key" ON "Purchase"("providerReference");
CREATE TABLE "MarketingCreditReservation" (
  "jobId" UUID NOT NULL,
  "purchaseId" INTEGER NOT NULL,
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCreditReservation_pkey" PRIMARY KEY ("jobId"),
  CONSTRAINT "MarketingCreditReservation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MarketingCreditReservation_purchaseId_idx" ON "MarketingCreditReservation"("purchaseId");
