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
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function checkItem() {
    return __awaiter(this, void 0, void 0, function* () {
        const item = yield prisma.item.findUnique({
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
        yield prisma.$disconnect();
    });
}
checkItem();
