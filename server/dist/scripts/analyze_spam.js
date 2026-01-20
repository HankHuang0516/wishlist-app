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
// Script to analyze spam accounts
const prisma_1 = __importDefault(require("../lib/prisma"));
function analyzeSpam() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== Spam Account Analysis ===\n');
        // 1. Count all "王小明" accounts
        const wangXiaomingCount = yield prisma_1.default.user.count({
            where: { name: '王小明' }
        });
        console.log(`Total "王小明" accounts: ${wangXiaomingCount}`);
        // 2. Get details of these accounts
        const wangXiaomingUsers = yield prisma_1.default.user.findMany({
            where: { name: '王小明' },
            select: {
                id: true,
                phoneNumber: true,
                email: true,
                isEmailVerified: true,
                createdAt: true,
                _count: {
                    select: {
                        wishlists: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        console.log('\n--- Detailed List ---');
        let emptyAccountCount = 0;
        for (const user of wangXiaomingUsers) {
            const hasContent = user._count.wishlists > 0;
            if (!hasContent)
                emptyAccountCount++;
            console.log(`ID: ${user.id} | Phone: ${user.phoneNumber} | Email: ${user.email || 'N/A'} | Verified: ${user.isEmailVerified} | Wishlists: ${user._count.wishlists} | Created: ${user.createdAt.toISOString()}`);
        }
        console.log(`\n--- Summary ---`);
        console.log(`Total "王小明" accounts: ${wangXiaomingCount}`);
        console.log(`Empty accounts (no wishlists): ${emptyAccountCount}`);
        console.log(`Accounts with content: ${wangXiaomingCount - emptyAccountCount}`);
        // 3. Find accounts safe to delete (no email, no wishlists)
        const safeToDelete = wangXiaomingUsers.filter(u => !u.email && u._count.wishlists === 0);
        console.log(`\nAccounts safe to delete (no email + no wishlists): ${safeToDelete.length}`);
        console.log('IDs:', safeToDelete.map(u => u.id).join(', '));
        yield prisma_1.default.$disconnect();
    });
}
analyzeSpam().catch(console.error);
