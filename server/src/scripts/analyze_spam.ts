// Script to analyze spam accounts
import prisma from '../lib/prisma';

async function analyzeSpam() {
    console.log('=== Spam Account Analysis ===\n');

    // 1. Count all "王小明" accounts
    const wangXiaomingCount = await prisma.user.count({
        where: { name: '王小明' }
    });
    console.log(`Total "王小明" accounts: ${wangXiaomingCount}`);

    // 2. Get details of these accounts
    const wangXiaomingUsers = await prisma.user.findMany({
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
        if (!hasContent) emptyAccountCount++;
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

    await prisma.$disconnect();
}

analyzeSpam().catch(console.error);
