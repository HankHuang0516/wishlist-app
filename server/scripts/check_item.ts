import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkItem() {
    const item = await prisma.item.findUnique({
        where: { id: 38 },
        select: {
            id: true,
            name: true,
            imageUrl: true,
            link: true,
            aiLink: true
        }
    });

    console.log('Item #38 Details:');
    console.log(JSON.stringify(item, null, 2));

    await prisma.$disconnect();
}

checkItem();
