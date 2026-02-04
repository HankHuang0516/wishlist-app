import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupTestUsers() {
  console.log('🧹 Starting Refined Test User Cleanup...');

  const testKeywords = [
    'aaaaa', 'Test', 'Tester', 'Naive', 'Agent', 'ApiKey', 'AvatarTester', 
    'DebugUser', 'CurlTest', 'ttt', '123', 'w', 'root', 'VerifyUser', 'Antigravity'
  ];

  const testPhonePatterns = ['09000', '09xxxxxxxx', '1234346', '01', '02', '123', '0'];

  try {
    // 1. Find users by name keywords
    const usersByName = await prisma.user.findMany({
      where: {
        OR: testKeywords.map(keyword => ({
          name: { contains: keyword, mode: 'insensitive' }
        }))
      }
    });

    // 2. Find users by phone patterns
    const usersByPhone = await prisma.user.findMany({
      where: {
        OR: testPhonePatterns.map(pattern => ({
          phoneNumber: { startsWith: pattern }
        }))
      }
    });

    // 3. Find users by specific IDs we identified earlier
    const specificIds = [924, 891, 927, 926, 925, 923, 922, 920, 919, 918, 917];
    const specificUsers = await prisma.user.findMany({
      where: { id: { in: specificIds } }
    });

    // Combine all and remove duplicates
    const allTestUsers = [...usersByName, ...usersByPhone, ...specificUsers];
    const uniqueUsers = Array.from(new Map(allTestUsers.map(u => [u.id, u])).values());

    console.log(`🔍 Identified ${uniqueUsers.length} test accounts.`);

    for (const user of uniqueUsers) {
      console.log(`🗑️ Deleting User and dependencies: ${user.name || 'N/A'} (ID: ${user.id})`);
      
      try {
        // Manually delete dependencies that don't have cascade delete
        await prisma.feedback.deleteMany({ where: { userId: user.id } });
        await prisma.follow.deleteMany({ where: { OR: [{ followerId: user.id }, { followingId: user.id }] } });
        await prisma.crawlerLog.deleteMany({ where: { userId: user.id } });
        await prisma.purchase.deleteMany({ where: { userId: user.id } });
        await prisma.itemWatch.deleteMany({ where: { userId: user.id } });
        
        // Wishlists should cascade delete items automatically based on schema
        await prisma.user.delete({
          where: { id: user.id }
        });
      } catch (e: any) {
        console.error(`❌ Failed to delete User ${user.id}: ${e.message}`);
      }
    }

    const finalCount = await prisma.user.count();
    console.log(`✅ Cleanup Complete. Remaining Real Users: ${finalCount}`);

  } catch (error) {
    console.error('💥 Fatal error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestUsers();
