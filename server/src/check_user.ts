
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { phoneNumber: '0935065876' }
    });
    console.log('User found:', user);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
