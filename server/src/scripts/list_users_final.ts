import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, phoneNumber: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(users, null, 2));
}

listUsers();
