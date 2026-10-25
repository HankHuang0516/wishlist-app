-- CreateTable
CREATE TABLE "ProductInterest" (
    "userId" INTEGER NOT NULL,
    "productKey" VARCHAR(80) NOT NULL,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductInterest_pkey" PRIMARY KEY ("userId","productKey")
);

-- CreateTable
CREATE TABLE "ProductInterestOperation" (
    "userId" INTEGER NOT NULL,
    "clientActionId" UUID NOT NULL,
    "productKey" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" TEXT NOT NULL,
    "appliedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInterestOperation_pkey" PRIMARY KEY ("userId","clientActionId")
);

-- CreateIndex
CREATE INDEX "ProductInterest_productKey_liked_idx" ON "ProductInterest"("productKey", "liked");

-- CreateIndex
CREATE INDEX "ProductInterestOperation_productKey_idx" ON "ProductInterestOperation"("productKey");

-- AddForeignKey
ALTER TABLE "ProductInterest" ADD CONSTRAINT "ProductInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInterestOperation" ADD CONSTRAINT "ProductInterestOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "ProductInterest" ADD CONSTRAINT "ProductInterest_valid" CHECK ("version">=0 AND "productKey" ~ '^(listing|source|external):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE "ProductInterestOperation" ADD CONSTRAINT "ProductInterestOperation_valid" CHECK ("state" IN ('APPLIED','CONFLICT','ABANDONED') AND "requestHash" ~ '^[a-f0-9]{64}$' AND (("state"='APPLIED' AND "appliedVersion">0) OR ("state"<>'APPLIED' AND "appliedVersion" IS NULL)));
