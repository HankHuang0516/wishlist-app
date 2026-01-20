"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Script to cleanup spam accounts
const prisma_1 = __importDefault(require("../lib/prisma"));
function cleanupSpam() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== Spam Account Cleanup ===\n');
        // Find accounts to delete:
        // - Name is "王小明"
        // - No email (legacy, not verified)
        // - No wishlists
        const spamUsers = yield prisma_1.default.user.findMany({
            where: {
                name: '王小明',
                email: null,
                wishlists: {
                    none: {}
                }
            },
            select: {
                id: true,
                phoneNumber: true,
                name: true,
                createdAt: true
            }
        });
        console.log(`Found ${spamUsers.length} spam accounts to delete:\n`);
        spamUsers.forEach(u => {
            console.log(`  ID: ${u.id} | Phone: ${u.phoneNumber} | Created: ${u.createdAt.toISOString()}`);
        });
        if (spamUsers.length === 0) {
            console.log('No spam accounts found. Exiting.');
            yield prisma_1.default.$disconnect();
            return;
        }
        const idsToDelete = spamUsers.map(u => u.id);
        console.log(`\nDeleting ${idsToDelete.length} accounts...`);
        // Delete related data first (follows, purchases, etc.)
        yield prisma_1.default.follow.deleteMany({
            where: {
                OR: [
                    { followerId: { in: idsToDelete } },
                    { followingId: { in: idsToDelete } }
                ]
            }
        });
        yield prisma_1.default.feedback.deleteMany({
            where: { userId: { in: idsToDelete } }
        });
        yield prisma_1.default.itemWatch.deleteMany({
            where: { userId: { in: idsToDelete } }
        });
        yield prisma_1.default.purchase.deleteMany({
            where: { userId: { in: idsToDelete } }
        });
        yield prisma_1.default.crawlerLog.deleteMany({
            where: { userId: { in: idsToDelete } }
        });
        // Finally delete users
        const result = yield prisma_1.default.user.deleteMany({
            where: { id: { in: idsToDelete } }
        });
        console.log(`✅ Deleted ${result.count} spam accounts.`);
        yield prisma_1.default.$disconnect();
    });
}
cleanupSpam().catch(console.error);
