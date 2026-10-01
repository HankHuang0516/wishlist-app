CREATE TYPE "PartnerInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DECLINED');

CREATE TABLE "PartnerInquiry" (
  "id" TEXT NOT NULL,
  "organization" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "websiteUrl" TEXT,
  "categories" TEXT[] NOT NULL,
  "estimatedActiveItems" INTEGER,
  "updateMethod" TEXT NOT NULL,
  "sampleUrls" TEXT[] NOT NULL,
  "message" TEXT,
  "contactConsentAt" TIMESTAMP(3) NOT NULL,
  "status" "PartnerInquiryStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerInquiry_status_createdAt_idx" ON "PartnerInquiry"("status", "createdAt");
