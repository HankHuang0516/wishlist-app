-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "otp" TEXT,
    "otpExpires" DATETIME,
    "realName" TEXT,
    "address" TEXT,
    "nicknames" TEXT NOT NULL DEFAULT 'piggy',
    "isAvatarVisible" BOOLEAN NOT NULL DEFAULT true,
    "isPhoneVisible" BOOLEAN NOT NULL DEFAULT false,
    "isRealNameVisible" BOOLEAN NOT NULL DEFAULT false,
    "isAddressVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "id", "name", "otp", "otpExpires", "password", "phoneNumber", "updatedAt") SELECT "avatarUrl", "createdAt", "id", "name", "otp", "otpExpires", "password", "phoneNumber", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
