
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const phoneNumber = '0935065876';
    const newPassword = 'password123';

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    try {
        const user = await prisma.user.update({
            where: { phoneNumber },
            data: { password: hashedPassword }
        });
        console.log(`Password for ${phoneNumber} reset to '${newPassword}'`);
    } catch (e) {
        console.error("Error resetting password:", e);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
