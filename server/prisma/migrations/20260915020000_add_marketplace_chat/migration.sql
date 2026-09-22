-- Additive, first-party text chat. No legacy tables or account IDs are rewritten.
CREATE TYPE "ConversationRole" AS ENUM ('BUYER', 'SELLER');
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "buyerUserId" INTEGER NOT NULL,
  "sellerUserId" INTEGER NOT NULL,
  "lastMessageSequence" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_distinct_parties" CHECK ("buyerUserId" <> "sellerUserId"),
  CONSTRAINT "Conversation_sequence_nonnegative" CHECK ("lastMessageSequence" >= 0)
);
CREATE TABLE "ConversationParticipant" (
  "conversationId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "ConversationRole" NOT NULL,
  "lastReadSequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId", "userId"),
  CONSTRAINT "ConversationParticipant_read_nonnegative" CHECK ("lastReadSequence" >= 0)
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderUserId" INTEGER NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "Message_text_bounded" CHECK (char_length("text") BETWEEN 1 AND 2000)
);
CREATE TABLE "UserBlock" (
  "blockerUserId" INTEGER NOT NULL,
  "blockedUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerUserId", "blockedUserId"),
  CONSTRAINT "UserBlock_not_self" CHECK ("blockerUserId" <> "blockedUserId")
);
CREATE UNIQUE INDEX "Conversation_listingId_buyerUserId_sellerUserId_key" ON "Conversation"("listingId", "buyerUserId", "sellerUserId");
CREATE INDEX "Conversation_buyerUserId_lastMessageAt_id_idx" ON "Conversation"("buyerUserId", "lastMessageAt", "id");
CREATE INDEX "Conversation_sellerUserId_lastMessageAt_id_idx" ON "Conversation"("sellerUserId", "lastMessageAt", "id");
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_role_key" ON "ConversationParticipant"("conversationId", "role");
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");
CREATE UNIQUE INDEX "Message_conversationId_senderUserId_clientMessageId_key" ON "Message"("conversationId", "senderUserId", "clientMessageId");
CREATE UNIQUE INDEX "Message_conversationId_sequence_key" ON "Message"("conversationId", "sequence");
CREATE INDEX "Message_conversationId_senderUserId_sequence_idx" ON "Message"("conversationId", "senderUserId", "sequence");
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_senderUserId_fkey" FOREIGN KEY ("conversationId", "senderUserId") REFERENCES "ConversationParticipant"("conversationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
