import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { decodeUserSessionJwt } from '../lib/jwtConfig';
import { generateApiKey } from '../lib/apiKey';
import { getApiUrl } from '../config/constants';
import { buildAiInstructions } from '../lib/aiIntegrationPrompt';

class IntegrationError extends Error { readonly status: number; constructor(status: number) { super('API integration unavailable'); this.status = status; } }
function emptyRequest(req: AuthRequest) {
    if (Object.keys(req.query).length || req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) throw new IntegrationError(400);
}
function usableKey(value: string) { return /^[^\s\u0000-\u001f\u007f]{1,512}$/.test(value); }
function integrationBase() {
    const url = new URL(getApiUrl().trim());
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/,'') !== '/api') throw new IntegrationError(503);
    if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new IntegrationError(503);
    return url.href.replace(/\/$/,'');
}
/** Serialize first allocation and explicit rotation with password/revocation
 * changes. Recheck the original credential under the same User row gate. A
 * returned key is current at this snapshot, not perpetual or historical proof. */
async function accountKey(req: AuthRequest, mode: 'read' | 'create' | 'rotate') {
    const id = req.user?.id; if (!id) throw new IntegrationError(401);
    return prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${id} FOR NO KEY UPDATE`);
        const user = await tx.user.findUnique({ where: { id }, select: { name: true, apiKey: true, authVersion: true } });
        if (!user) throw new IntegrationError(401);
        // Retain authenticateToken's existing personal-key precedence.
        const personal = req.get('X-Api-Key');
        if (personal) { if (!usableKey(personal) || personal !== user.apiKey) throw new IntegrationError(401); }
        else {
            const bearer = /^Bearer ([^\s]{1,8192})$/.exec(req.get('Authorization') ?? '');
            if (!bearer) throw new IntegrationError(401);
            try { const claims = decodeUserSessionJwt(bearer[1]); if (claims.id !== id || claims.authVersion !== user.authVersion) throw new IntegrationError(401); }
            catch (error) { if (error instanceof jwt.JsonWebTokenError) throw new IntegrationError(401); throw error; }
        }
        let key = user.apiKey;
        if (mode !== 'rotate' && key !== null && !usableKey(key)) throw new IntegrationError(503);
        if (mode === 'rotate' || mode === 'create' && !key) {
            key = generateApiKey(); await tx.user.update({ where: { id }, data: { apiKey: key } });
        }
        return { key, name: user.name || 'User' };
    });
}
function rejected(res: Response, error: unknown) {
    const status = error instanceof IntegrationError ? error.status : 503;
    return res.status(status).json({ errorCode: status === 400 ? 'API_INTEGRATION_INVALID_REQUEST' : status === 401 ? 'API_INTEGRATION_AUTH_REQUIRED' : 'API_INTEGRATION_UNAVAILABLE' });
}
export async function generateUserApiKey(req: AuthRequest, res: Response) {
    res.set('Cache-Control','private, no-store');
    try { emptyRequest(req); const value = await accountKey(req,'rotate'); return res.json({ apiKey: value.key }); } catch (error) { return rejected(res,error); }
}
export async function getUserApiKey(req: AuthRequest, res: Response) {
    res.set('Cache-Control','private, no-store');
    try { emptyRequest(req); const value = await accountKey(req,'read'); return res.json({ apiKey: value.key }); } catch (error) { return rejected(res,error); }
}
async function instructions(req: AuthRequest, res: Response, create: boolean) {
    res.set('Cache-Control','private, no-store');
    try {
        emptyRequest(req); const base = integrationBase(); const value = await accountKey(req,create ? 'create' : 'read');
        if (!value.key) return res.json({ available: false });
        return res.json(buildAiInstructions(value.key,value.name,base));
    } catch (error) { return rejected(res,error); }
}
export const generateAiPrompt = (req: AuthRequest, res: Response) => instructions(req,res,true);
export const getCurrentAiPrompt = (req: AuthRequest, res: Response) => instructions(req,res,false);
