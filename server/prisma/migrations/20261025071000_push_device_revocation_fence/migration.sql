-- Retain the highest installation registration version after revocation.
-- User erasure still cascades these rows. No existing token is changed here.
ALTER TABLE "PushDevice" ALTER COLUMN "expoPushToken" DROP NOT NULL;
