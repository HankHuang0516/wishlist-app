ALTER TABLE "Message" ADD COLUMN "photoBytes" BYTEA,
 ADD COLUMN "photoHash" TEXT, ADD COLUMN "photoWidth" INTEGER,
 ADD COLUMN "photoHeight" INTEGER, ADD COLUMN "photoByteSize" INTEGER;
ALTER TABLE "Message" ADD CONSTRAINT "Message_photo_consistent" CHECK (
 ("photoBytes" IS NULL AND "photoHash" IS NULL AND "photoWidth" IS NULL AND "photoHeight" IS NULL AND "photoByteSize" IS NULL) OR
 ("photoBytes" IS NOT NULL AND "photoHash" IS NOT NULL AND "photoHash" ~ '^[a-f0-9]{64}$' AND "photoWidth" IS NOT NULL AND "photoHeight" IS NOT NULL AND "photoByteSize" IS NOT NULL AND "photoWidth" > 0 AND "photoHeight" > 0 AND "photoByteSize" = octet_length("photoBytes") AND "photoByteSize" <= 5242880));

CREATE TABLE "ChatPhotoCancellation" (
 "conversationId" TEXT NOT NULL, "senderUserId" INTEGER NOT NULL,
 "clientMessageId" TEXT NOT NULL, "photoHash" TEXT NOT NULL, "text" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChatPhotoCancellation_pkey" PRIMARY KEY ("conversationId","senderUserId","clientMessageId"),
 CONSTRAINT "ChatPhotoCancellation_participant_fkey" FOREIGN KEY ("conversationId","senderUserId") REFERENCES "ConversationParticipant"("conversationId","userId") ON DELETE CASCADE ON UPDATE CASCADE
);
