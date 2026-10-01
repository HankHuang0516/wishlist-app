ALTER TABLE "User" ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ProfileUpdateReceipt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientActionId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(12) NOT NULL,
    "appliedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileUpdateReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProfileUpdateReceipt_state_check" CHECK (
        ("state" = 'APPLIED' AND "appliedVersion" > 0) OR
        ("state" IN ('CONFLICT', 'ABANDONED') AND "appliedVersion" IS NULL)
    ),
    CONSTRAINT "ProfileUpdateReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProfileUpdateReceipt_userId_clientActionId_key" ON "ProfileUpdateReceipt"("userId", "clientActionId");
