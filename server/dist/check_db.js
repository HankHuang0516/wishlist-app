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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// Force absolute path to ONE of the DBs to verify
const DB_PATH = 'file:C:/Users/z004rx2h/.gemini/antigravity/scratch/wishlist-app/server/dev.db';
// const DB_PATH = 'file:C:/Users/z004rx2h/.gemini/antigravity/scratch/wishlist-app/server/prisma/dev.db';
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: DB_PATH
        }
    }
});
function checkDb() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`🔍 Checking DB at: ${DB_PATH}`);
            const items = yield prisma.item.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    link: true,
                    aiStatus: true,
                    aiError: true,
                    createdAt: true,
                    aiLink: true
                }
            });
            console.log(JSON.stringify(items, null, 2));
        }
        catch (error) {
            console.error("❌ DB Query failed:", error);
        }
        finally {
            yield prisma.$disconnect();
        }
    });
}
checkDb();
