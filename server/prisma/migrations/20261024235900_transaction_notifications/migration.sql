-- AlterTable
ALTER TABLE "SourceLeadInquiry" ADD COLUMN     "lastReadReplySequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replySequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" INTEGER NOT NULL,
    "chat" BOOLEAN NOT NULL DEFAULT true,
    "meetup" BOOLEAN NOT NULL DEFAULT true,
    "sourceReply" BOOLEAN NOT NULL DEFAULT true,
    "preview" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationPreferenceOperation" (
    "userId" INTEGER NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "appliedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreferenceOperation_pkey" PRIMARY KEY ("userId","clientActionId")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushOutbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "messageId" TEXT,
    "meetupId" TEXT,
    "inquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PushOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "outboxId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "ticketId" TEXT,
    "receiptCheckAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("outboxId","deviceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_expoPushToken_key" ON "PushDevice"("expoPushToken");

-- CreateIndex
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushOutbox_eventKey_key" ON "PushOutbox"("eventKey");

-- CreateIndex
CREATE INDEX "PushOutbox_processedAt_nextAttemptAt_idx" ON "PushOutbox"("processedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PushDelivery_state_receiptCheckAt_idx" ON "PushDelivery"("state", "receiptCheckAt");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferenceOperation" ADD CONSTRAINT "NotificationPreferenceOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushOutbox" ADD CONSTRAINT "PushOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushOutbox" ADD CONSTRAINT "PushOutbox_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushOutbox" ADD CONSTRAINT "PushOutbox_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "MeetupAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushOutbox" ADD CONSTRAINT "PushOutbox_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "SourceLeadInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "PushOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "NotificationPreference" ADD CONSTRAINT "notification_version_nonnegative" CHECK ("version" >= 0);
ALTER TABLE "NotificationPreferenceOperation" ADD CONSTRAINT "notification_operation_state" CHECK ("state" IN ('APPLIED','CONFLICT','ABANDONED'));
ALTER TABLE "PushOutbox" ADD CONSTRAINT "push_event_reference" CHECK (("kind"='CHAT' AND "messageId" IS NOT NULL AND "meetupId" IS NULL AND "inquiryId" IS NULL) OR ("kind"='MEETUP' AND "meetupId" IS NOT NULL AND "messageId" IS NULL AND "inquiryId" IS NULL) OR ("kind"='SOURCE_REPLY' AND "inquiryId" IS NOT NULL AND "messageId" IS NULL AND "meetupId" IS NULL));
UPDATE "SourceLeadInquiry" SET "replySequence"=(SELECT COUNT(*) FROM jsonb_array_elements(CASE WHEN jsonb_typeof("events")='array' THEN "events" ELSE '[]'::jsonb END) e WHERE e->>'action'='SELLER_REPLY');
ALTER TABLE "SourceLeadInquiry" ADD CONSTRAINT "source_reply_read_position" CHECK ("replySequence">=0 AND "lastReadReplySequence">=0 AND "lastReadReplySequence"<="replySequence");

ALTER TABLE "PushDevice" ADD COLUMN "registrationVersion" INTEGER NOT NULL DEFAULT 0;
