// Script to cleanup spam accounts
import prisma from '../lib/prisma';

async function cleanupSpam() {
    console.log('=== Spam Account Cleanup ===\n');

    // Find accounts to delete:
    // - Name is "王小明"
    // - No email (legacy, not verified)
    // - No wishlists

    const spamUsers = await prisma.user.findMany({
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
        await prisma.$disconnect();
        return;
    }

    const idsToDelete = spamUsers.map(u => u.id);

    console.log(`\nDeleting ${idsToDelete.length} accounts...`);

    // Delete related data first (follows, purchases, etc.)
    await prisma.follow.deleteMany({
        where: {
            OR: [
                { followerId: { in: idsToDelete } },
                { followingId: { in: idsToDelete } }
            ]
        }
    });

    await prisma.feedback.deleteMany({
        where: { userId: { in: idsToDelete } }
    });

    await prisma.itemWatch.deleteMany({
        where: { userId: { in: idsToDelete } }
    });

    await prisma.purchase.deleteMany({
        where: { userId: { in: idsToDelete } }
    });

    await prisma.crawlerLog.deleteMany({
        where: { userId: { in: idsToDelete } }
    });

    // Finally delete users
    const result = await prisma.user.deleteMany({
        where: { id: { in: idsToDelete } }
    });

    console.log(`✅ Deleted ${result.count} spam accounts.`);

    await prisma.$disconnect();
}

cleanupSpam().catch(console.error);
