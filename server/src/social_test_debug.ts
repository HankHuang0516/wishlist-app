import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testFollow() {
    try {
        console.log("Connecting to DB...");

        // 1. Create two test users if they don't exist
        const u1 = await prisma.user.upsert({
            where: { phoneNumber: "0999001" },
            update: {},
            create: { phoneNumber: "0999001", password: "pass", name: "TestUser1" }
        });

        const u2 = await prisma.user.upsert({
            where: { phoneNumber: "0999002" },
            update: {},
            create: { phoneNumber: "0999002", password: "pass", name: "TestUser2" }
        });

        console.log(`Users: ${u1.id} (U1) and ${u2.id} (U2)`);

        // 2. Try to make U1 follow U2
        console.log("Attempting U1 follows U2...");

        const updated = await prisma.user.update({
            where: { id: u1.id },
            data: {
                following: {
                    connect: { id: u2.id }
                }
            }
        });

        console.log("Follow successful!", updated);

    } catch (error) {
        console.error("PRISMA ERROR FULL OBJECT:", error);
    } finally {
        await prisma.$disconnect();
    }
}

testFollow();
