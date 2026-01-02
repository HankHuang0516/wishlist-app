
import { PrismaClient } from '@prisma/client';

// Force absolute path to ONE of the DBs to verify
const DB_PATH = 'file:C:/Users/z004rx2h/.gemini/antigravity/scratch/wishlist-app/server/dev.db';
// const DB_PATH = 'file:C:/Users/z004rx2h/.gemini/antigravity/scratch/wishlist-app/server/prisma/dev.db';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: DB_PATH
        }
    }
});

async function checkDb() {
    try {
        console.log(`🔍 Checking DB at: ${DB_PATH}`);
        const items = await prisma.item.findMany({
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
    } catch (error) {
        console.error("❌ DB Query failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
