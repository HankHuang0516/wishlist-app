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
    /**
     * Set by authenticateEclawAgent once EClaw has verified the caller's identity.
     * `publicCode` is the agent's OWN verified 6-char EClaw public code — the
     * write path binds proxy_end_user_id to it. The token/bot secret is NEVER
     * stored here; only this resolved code survives.
     */
    eclawAgent?: {
        publicCode: string;
    };
}

import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';
import { extractAgentCredentials, verifyEclawAgent } from '../lib/eclawVerify';

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

/**
 * authenticateEclawAgent — the NO-merchant-key write-path gate (card_e30cf03d).
 *
 * The caller proves its OWN EClaw identity via either the short-lived token
 * header (`x-eclaw-agent-token`, preferred) or the transient triple
 * (`x-eclaw-device-id` / `x-eclaw-entity-id` / `x-eclaw-bot-secret`). We call
 * BACK to EClaw to verify it. Only on a live { valid:true } do we set
 * `req.eclawAgent = { publicCode }` and continue. Fail modes:
 *   - no credentials                → 401
 *   - invalid / spoofed identity    → 403 (no write)
 *   - EClaw verify unavailable      → 503 FAIL-CLOSED (no write)
 *
 * The token / bot secret is VERIFY-THEN-DISCARD: never persisted, never logged.
 */
export const authenticateEclawAgent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const creds = extractAgentCredentials(req.headers as Record<string, unknown>);
    if (!creds) {
        return res.status(401).json({
            error: 'EClaw agent identity required (x-eclaw-agent-token or device/entity/bot-secret headers)',
            errorCode: API_ERROR_CODES.MISSING_TOKEN,
        });
    }

    let result;
    try {
        result = await verifyEclawAgent(creds);
    } catch {
        // Defensive: verifyEclawAgent already swallows its own errors, but never
        // let an unexpected throw leak the credentials or fail open.
        return res.status(503).json({
            error: 'EClaw identity verification unavailable',
            errorCode: API_ERROR_CODES.INTERNAL_ERROR,
        });
    }

    if (!result.ok) {
        if (result.reason === 'upstream_error') {
            // EClaw is down → fail CLOSED, do not write.
            return res.status(503).json({
                error: 'EClaw identity verification unavailable; try again later',
                errorCode: API_ERROR_CODES.INTERNAL_ERROR,
            });
        }
        return res.status(403).json({
            error: 'EClaw agent identity could not be verified',
            errorCode: API_ERROR_CODES.ACCESS_DENIED,
        });
    }

    // Verified. Bind ONLY the resolved public code; the proof is discarded.
    req.eclawAgent = { publicCode: result.publicCode! };
    return next();
};

/**
 * authenticateUserOrEclawAgent — accept a logged-in USER (JWT / x-api-key) OR a
 * verified EClaw AGENT (token / triple). Replaces the old
 * authenticateUserOrMerchant on item-create routes so the merchant key is gone
 * while human users keep their existing auth.
 */
export const authenticateUserOrEclawAgent = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] as string;
    const token = authHeader && (authHeader as string).split(' ')[1];
    const hasEclawAgent = !!extractAgentCredentials(req.headers as Record<string, unknown>);

    if (!token && !apiKey && !hasEclawAgent) {
        return res.status(401).json({ error: 'Authentication required', errorCode: API_ERROR_CODES.MISSING_TOKEN });
    }

    // A logged-in user takes precedence (their JWT/apiKey binds a real account).
    if (token || apiKey) {
        return authenticateToken(req, res, next);
    }
    return authenticateEclawAgent(req, res, next);
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
