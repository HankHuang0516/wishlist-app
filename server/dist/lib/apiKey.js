"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const generateApiKey = () => {
    // Generate a secure random string
    // 32 bytes = 64 hex characters
    const randomBytes = crypto_1.default.randomBytes(32).toString('hex');
    return `sk_live_${randomBytes}`;
};
exports.generateApiKey = generateApiKey;
