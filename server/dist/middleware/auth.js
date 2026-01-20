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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token && !apiKey) {
        return res.status(401).json({ error: 'Access denied' });
    }
    // API Key Authentication
    if (apiKey) {
        try {
            const user = yield prisma_1.default.user.findUnique({
                where: { apiKey: apiKey }
            });
            if (!user) {
                return res.status(401).json({ error: 'Invalid API Key' });
            }
            req.user = { id: user.id };
            return next();
        }
        catch (error) {
            console.error('API Key Auth Error:', error);
            return res.status(500).json({ error: 'Internal server error during authentication' });
        }
    }
    // JWT Authentication
    if (token) {
        try {
            const verified = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret_key_default');
            req.user = verified;
            next();
        }
        catch (error) {
            res.status(400).json({ error: 'Invalid token' });
        }
    }
});
exports.authenticateToken = authenticateToken;
