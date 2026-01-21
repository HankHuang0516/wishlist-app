
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'hankhuang0516@gmail.com';
    console.log(`[DB] Looking up user: ${email}`);

    try {
        const user = await prisma.user.findFirst({
            where: { email }
        });

        if (user) {
            console.log(`[DB] Found User:`);
            console.log(` - ID: ${user.id}`);
            console.log(` - Name: ${user.name}`);
            console.log(` - Verified: ${user.isEmailVerified}`);
            console.log(` - Token: ${user.emailVerificationToken ? 'Present' : 'None'}`);

            console.log(`[DB] Deleting user...`);
            await prisma.user.delete({
                where: { id: user.id }
            });
            console.log(`[DB] User deleted successfully.`);
        } else {
            console.log(`[DB] User not found.`);
        }

    } catch (e) {
        console.error(`[DB] Error:`, e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
