
import prisma from '../lib/prisma';

async function main() {
    console.log('Testing DB connection...');
    try {
        const count = await prisma.user.count();
        console.log(`DB Connection OK. User count: ${count}`);
    } catch (e) {
        console.error('DB Connection Failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
