import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkImageUrls() {
    console.log('🔍 Checking Image URLs\n');
    console.log('='.repeat(60));

    // Get the items mentioned in the screenshot
    const items = await prisma.item.findMany({
        where: {
            OR: [
                { name: { contains: 'CITIZEN' } },
                { name: { contains: '萬代' } },
                { name: { contains: '任天堂 Switch 2' } },
                { name: { contains: 'POP MART' } }
            ]
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
            createdAt: true
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: 10
    });

    console.log(`\nFound ${items.length} items:\n`);

    for (const item of items) {
        const isFlickr = item.imageUrl?.includes('flickr.com');
        const isLocal = item.imageUrl?.startsWith('/uploads/');
        const isExternal = item.imageUrl?.startsWith('http') && !isFlickr;

        console.log(`Item #${item.id}: ${item.name}`);
        console.log(`  Created: ${item.createdAt.toISOString()}`);
        console.log(`  Image URL: ${item.imageUrl}`);
        console.log(`  Type: ${isFlickr ? '✅ Flickr' : isLocal ? '⚠️  Local' : isExternal ? '🌐 External' : '❓ Unknown'}`);
        console.log('');
    }

    await prisma.$disconnect();
}

checkImageUrls();
