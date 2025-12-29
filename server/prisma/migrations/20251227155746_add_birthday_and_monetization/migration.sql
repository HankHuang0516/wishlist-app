/*
  Warnings:

  - You are about to drop the column `otp` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `otpExpires` on the `User` table. All the data in the column will be lost.

*/
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
    "isPremium" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("address", "avatarUrl", "createdAt", "id", "isAddressVisible", "isAvatarVisible", "isPhoneVisible", "isRealNameVisible", "name", "nicknames", "password", "phoneNumber", "realName", "updatedAt") SELECT "address", "avatarUrl", "createdAt", "id", "isAddressVisible", "isAvatarVisible", "isPhoneVisible", "isRealNameVisible", "name", "nicknames", "password", "phoneNumber", "realName", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
CREATE TABLE "new_Wishlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    "maxItems" INTEGER NOT NULL DEFAULT 100,
    CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wishlist" ("createdAt", "description", "id", "isPublic", "title", "updatedAt", "userId") SELECT "createdAt", "description", "id", "isPublic", "title", "updatedAt", "userId" FROM "Wishlist";
DROP TABLE "Wishlist";
ALTER TABLE "new_Wishlist" RENAME TO "Wishlist";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
