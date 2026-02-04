import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function emergencyFix() {
  const tempPassword = await bcrypt.hash('Asasas123', 10);
  
  console.log('🚨 Starting Emergency Restore and Bot Cleanup...');

  // 1. Delete "王小明" Bots
  try {
    const bots = await prisma.user.findMany({
      where: { name: '王小明' }
    });
    console.log(`🧹 Found ${bots.length} "王小明" bots. Deleting...`);
    for (const bot of bots) {
        await prisma.feedback.deleteMany({ where: { userId: bot.id } });
        await prisma.follow.deleteMany({ where: { OR: [{ followerId: bot.id }, { followingId: bot.id }] } });
        await prisma.crawlerLog.deleteMany({ where: { userId: bot.id } });
        await prisma.purchase.deleteMany({ where: { userId: bot.id } });
        await prisma.itemWatch.deleteMany({ where: { userId: bot.id } });
        await prisma.user.delete({ where: { id: bot.id } });
    }
  } catch (e) {
    console.error('Error deleting bots:', e);
  }

  // 2. Restore Real Users (based on captured data)
  // ID 11: 黃晨紘 (01), ID 12: 姵涵 (02), ID 2: 黃品翰 (0935065876)
  // ID 4: Judy (0981669530), ID 1: Test (0912345678)
  // Others: 15, 16, 14, 17, 18, 19, 26, 9, 10
  
  const realUsersToRestore = [
    { name: '黃品翰', phoneNumber: '0935065876' },
    { name: '黃晨紘', phoneNumber: '01' },
    { name: '姵涵', phoneNumber: '02' },
    { name: 'Judy', phoneNumber: '0981669530' },
    { name: 'Test', phoneNumber: '0912345678' },
    { name: 'DebugUser', phoneNumber: '09899998888' },
    { name: 'DebugUser2', phoneNumber: '0911223344' },
    { name: 'ttt', phoneNumber: '1234346' },
    { name: 'DebugUser2', phoneNumber: 'DebugUser2' },
    { name: 'DebugUser4', phoneNumber: '0900111222' },
    { name: 'DebugUser5', phoneNumber: '0900555666' },
    { name: 'Mobile Tester', phoneNumber: '0933445566' },
    { name: 'TargetUser', phoneNumber: '0991230223446' },
    { name: 'ObserverUser', phoneNumber: '0981230223446' }
  ];

  console.log('🔧 Restoring real accounts...');
  for (const user of realUsersToRestore) {
    try {
      await prisma.user.upsert({
        where: { phoneNumber: user.phoneNumber },
        update: {},
        create: {
          name: user.name,
          phoneNumber: user.phoneNumber,
          password: tempPassword
        }
      });
      console.log(`✅ Restored: ${user.name}`);
    } catch (e) {
      console.error(`❌ Failed to restore ${user.name}:`, e);
    }
  }

  const finalCount = await prisma.user.count();
  console.log(`🏁 Operation Complete. Current User Count: ${finalCount}`);
  await prisma.$disconnect();
}

emergencyFix();
