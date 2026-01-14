import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Fix Upload Status for Legacy Items
 *
 * Problem: All existing items have uploadStatus='PENDING' because that was the initial default.
 * Solution: Update all items with imageUrl (meaning upload completed) to uploadStatus='COMPLETED'.
 */
async function fixUploadStatus() {
    console.log('🔧 Fixing uploadStatus for legacy items...\n');

    // Find all items that have images but status is still PENDING
    const itemsToFix = await prisma.item.findMany({
        where: {
            uploadStatus: 'PENDING',
            imageUrl: {
                not: null
            }
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
            uploadStatus: true
        }
    });

    console.log(`📊 Found ${itemsToFix.length} items to fix\n`);

    if (itemsToFix.length === 0) {
        console.log('✅ No items need fixing!');
        await prisma.$disconnect();
        return;
    }

    // Update them to COMPLETED
    const result = await prisma.item.updateMany({
        where: {
            uploadStatus: 'PENDING',
            imageUrl: {
                not: null
            }
        },
        data: {
            uploadStatus: 'COMPLETED'
        }
    });

    console.log(`✅ Updated ${result.count} items to uploadStatus='COMPLETED'\n`);

    // Show sample of fixed items
    console.log('📝 Sample of fixed items:');
    itemsToFix.slice(0, 5).forEach(item => {
        console.log(`  - Item #${item.id}: ${item.name}`);
        console.log(`    Image: ${item.imageUrl}`);
        console.log(`    Status: PENDING → COMPLETED\n`);
    });

    await prisma.$disconnect();
    console.log('🎉 Fix completed!');
}

fixUploadStatus().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
