-- Existing users remain opted out; no delivery service is enabled here.
ALTER TABLE "User" ADD COLUMN "marketingEmailsEnabled" BOOLEAN NOT NULL DEFAULT false;
