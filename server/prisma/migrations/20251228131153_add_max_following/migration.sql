-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "nicknames" TEXT,
    "realName" TEXT,
    "address" TEXT,
    "birthday" DATETIME,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isAvatarVisible" BOOLEAN NOT NULL DEFAULT true,
    "isPhoneVisible" BOOLEAN NOT NULL DEFAULT false,
    "isRealNameVisible" BOOLEAN NOT NULL DEFAULT false,
    "isAddressVisible" BOOLEAN NOT NULL DEFAULT false,
    "isBirthdayVisible" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "maxWishlistItems" INTEGER NOT NULL DEFAULT 100,
    "maxFollowing" INTEGER NOT NULL DEFAULT 100,
    "otp" TEXT,
    "otpExpires" DATETIME,
    "lastFeedbackAt" DATETIME
);
INSERT INTO "new_User" ("address", "avatarUrl", "birthday", "createdAt", "id", "isAddressVisible", "isAvatarVisible", "isBirthdayVisible", "isPhoneVisible", "isPremium", "isRealNameVisible", "lastFeedbackAt", "maxWishlistItems", "name", "nicknames", "otp", "otpExpires", "password", "phoneNumber", "realName", "updatedAt") SELECT "address", "avatarUrl", "birthday", "createdAt", "id", "isAddressVisible", "isAvatarVisible", "isBirthdayVisible", "isPhoneVisible", "isPremium", "isRealNameVisible", "lastFeedbackAt", "maxWishlistItems", "name", "nicknames", "otp", "otpExpires", "password", "phoneNumber", "realName", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
