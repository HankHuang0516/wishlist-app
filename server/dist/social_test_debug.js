"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function testFollow() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Connecting to DB...");
            // 1. Create two test users if they don't exist
            const u1 = yield prisma.user.upsert({
                where: { phoneNumber: "0999001" },
                update: {},
                create: { phoneNumber: "0999001", password: "pass", name: "TestUser1" }
            });
            const u2 = yield prisma.user.upsert({
                where: { phoneNumber: "0999002" },
                update: {},
                create: { phoneNumber: "0999002", password: "pass", name: "TestUser2" }
            });
            console.log(`Users: ${u1.id} (U1) and ${u2.id} (U2)`);
            // 2. Try to make U1 follow U2
            console.log("Attempting U1 follows U2...");
            const updated = yield prisma.user.update({
                where: { id: u1.id },
                data: {
                    following: {
                        connect: { id: u2.id }
                    }
                }
            });
            console.log("Follow successful!", updated);
        }
        catch (error) {
            console.error("PRISMA ERROR FULL OBJECT:", error);
        }
        finally {
            yield prisma.$disconnect();
        }
    });
}
testFollow();
