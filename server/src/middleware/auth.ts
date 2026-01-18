import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        id: number;
    };
}

import prisma from '../lib/prisma';

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] as string;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && !apiKey) {
        return res.status(401).json({ error: 'Access denied' });
    }

    // API Key Authentication
    if (apiKey) {
        try {
            const user = await prisma.user.findUnique({
                where: { apiKey: apiKey }
            });

            if (!user) {
                return res.status(401).json({ error: 'Invalid API Key' });
            }

            req.user = { id: user.id };
            return next();
        } catch (error) {
            console.error('API Key Auth Error:', error);
            return res.status(500).json({ error: 'Internal server error during authentication' });
        }
    }

    // JWT Authentication
    if (token) {
        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_default');
            req.user = verified as { id: number };
            next();
        } catch (error) {
            res.status(400).json({ error: 'Invalid token' });
        }
    }
};
