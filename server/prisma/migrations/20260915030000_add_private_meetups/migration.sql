CREATE TYPE "MeetupStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TABLE "MeetupAppointment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MeetupStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedByUserId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "placeName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT NOT NULL,
    "buyerConfirmedAt" TIMESTAMP(3),
    "sellerConfirmedAt" TIMESTAMP(3),
    "buyerCompletedAt" TIMESTAMP(3),
    "sellerCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetupAppointment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MeetupAppointment_terms_check" CHECK (
        "version" > 0 AND "endsAt" >= "startsAt" + interval '15 minutes' AND "endsAt" <= "startsAt" + interval '240 minutes'
        AND "timeZone" = 'Asia/Taipei' AND char_length("placeName") BETWEEN 1 AND 160 AND char_length("notes") <= 1000
        AND (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN 20 AND 26.6 AND "longitude" BETWEEN 117 AND 123.8))
    ),
    CONSTRAINT "MeetupAppointment_confirmation_check" CHECK (
        ("status" NOT IN ('CONFIRMED', 'COMPLETED') OR ("buyerConfirmedAt" IS NOT NULL AND "sellerConfirmedAt" IS NOT NULL))
        AND ("status" <> 'COMPLETED' OR ("buyerCompletedAt" IS NOT NULL AND "sellerCompletedAt" IS NOT NULL))
    )
);
CREATE TABLE "MeetupOperation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resultingVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetupOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MeetupOperation_action_check" CHECK ("action" IN ('PROPOSE', 'REVISE', 'CONFIRM', 'CANCEL', 'COMPLETE') AND "resultingVersion" > 0)
);
CREATE UNIQUE INDEX "MeetupAppointment_conversationId_key" ON "MeetupAppointment"("conversationId");
CREATE INDEX "MeetupAppointment_status_startsAt_endsAt_idx" ON "MeetupAppointment"("status", "startsAt", "endsAt");
CREATE INDEX "MeetupOperation_conversationId_createdAt_idx" ON "MeetupOperation"("conversationId", "createdAt");
CREATE UNIQUE INDEX "MeetupOperation_conversationId_actorUserId_clientActionId_key" ON "MeetupOperation"("conversationId", "actorUserId", "clientActionId");
ALTER TABLE "MeetupAppointment" ADD CONSTRAINT "MeetupAppointment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetupAppointment" ADD CONSTRAINT "MeetupAppointment_conversationId_proposedByUserId_fkey" FOREIGN KEY ("conversationId", "proposedByUserId") REFERENCES "ConversationParticipant"("conversationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetupOperation" ADD CONSTRAINT "MeetupOperation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetupOperation" ADD CONSTRAINT "MeetupOperation_conversationId_actorUserId_fkey" FOREIGN KEY ("conversationId", "actorUserId") REFERENCES "ConversationParticipant"("conversationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
