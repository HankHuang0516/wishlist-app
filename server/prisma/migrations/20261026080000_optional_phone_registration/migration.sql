-- Preserve every existing phone number. Email-verified accounts may omit it.
ALTER TABLE "User" ALTER COLUMN "phoneNumber" DROP NOT NULL;
