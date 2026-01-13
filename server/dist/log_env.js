"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
console.log('--- ENV DEBUG ---');
console.log('CWD:', process.cwd());
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Absolute path of ./dev.db:', path_1.default.resolve('./dev.db'));
