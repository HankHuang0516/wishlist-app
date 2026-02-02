import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        id: number;
    };
    merchant?: {
        id: number;
        name: string;
    };
}

import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] as string;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && !apiKey) {
        return res.status(401).json({ error: 'Access denied', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    }

    // API Key Authentication
    if (apiKey) {
        try {
            const user = await prisma.user.findUnique({
                where: { apiKey: apiKey }
            });

            if (!user) {
                return res.status(401).json({ error: 'Invalid API Key', errorCode: API_ERROR_CODES.INVALID_TOKEN });
            }

            req.user = { id: user.id };
            return next();
        } catch (error) {
            console.error('API Key Auth Error:', error);
            return res.status(500).json({ error: 'Internal server error during authentication', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
        }
    }

    // JWT Authentication
    if (token) {
        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_default');
            req.user = verified as { id: number };
            next();
        } catch (error) {
            res.status(400).json({ error: 'Invalid token', errorCode: API_ERROR_CODES.INVALID_TOKEN });
        }
    }
};

export const authenticateMerchant = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const merchantApiKey = req.headers['x-merchant-api-key'] as string;
    const origin = req.headers['origin'] || req.headers['referer'];

    if (!merchantApiKey) {
        return res.status(401).json({ error: 'Merchant API Key required', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    }

    try {
        const merchant = await prisma.merchant.findUnique({
            where: { apiKey: merchantApiKey }
        });

        if (!merchant) {
            return res.status(401).json({ error: 'Invalid Merchant API Key', errorCode: API_ERROR_CODES.INVALID_TOKEN });
        }

        // Simple CORS whitelist check
        if (merchant.corsWhitelist !== '*') {
            const whitelist = merchant.corsWhitelist.split(',').map(s => s.trim());
            const originStr = Array.isArray(origin) ? origin[0] : origin;
            
            if (originStr) {
                const isAllowed = whitelist.some(w => originStr.includes(w));
                if (!isAllowed) {
                    console.warn(`[MerchantAuth] Origin ${originStr} not allowed for merchant ${merchant.name}`);
                    return res.status(403).json({ error: 'Origin not allowed', errorCode: API_ERROR_CODES.ACCESS_DENIED });
                }
            }
        }

        req.merchant = { id: merchant.id, name: merchant.name };
        next();
    } catch (error) {
        console.error('Merchant Auth Error:', error);
        return res.status(500).json({ error: 'Internal server error during authentication', errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
};

export const authenticateUserOrMerchant = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] as string;
    const merchantApiKey = req.headers['x-merchant-api-key'] as string;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && !apiKey && !merchantApiKey) {
        return res.status(401).json({ error: 'Authentication required', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    }

    if (merchantApiKey) {
        return authenticateMerchant(req, res, next);
    } else {
        return authenticateToken(req, res, next);
    }
};
// Optional Authentication (for public endpoints that can be personalized)
export const optionalAuthenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] as string;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && !apiKey) {
        return next(); // Proceed without user
    }

    // API Key Authentication
    if (apiKey) {
        try {
            const user = await prisma.user.findUnique({
                where: { apiKey: apiKey }
            });

            if (user) {
                req.user = { id: user.id };
            }
        } catch (error) {
            console.warn('Optional Auth - API Key Error:', error);
        }
        return next();
    }

    // JWT Authentication
    if (token) {
        if (token === 'null' || token === 'undefined') return next();

        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_default');
            req.user = verified as { id: number };
        } catch (error) {
            // Ignore invalid tokens in optional auth
        }
        next();
    }
};
