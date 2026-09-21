import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthRequest } from '../middleware/auth';
import { AccountSecurityError, securityBody } from '../lib/accountSecurityRules';
import { readAccountDeletionImpact } from '../lib/accountDeletionImpact';
import { abandonAccountErasure, eraseAccountData, readAccountErasureReceipt } from '../lib/accountErasure';
import { decodeUserSessionJwt, JwtConfigurationError } from '../lib/jwtConfig';

// Deliberately not authenticateToken: User may have been erased before a lost
// ACK retry. This verified binding never admits other APIs or skips core auth.
export function authenticateErasureSession(req: AuthRequest, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'private, no-store');
    const header = req.headers.authorization;
    if (req.headers['x-api-key'] !== undefined || typeof header !== 'string' || !/^Bearer [^\s]+$/.test(header) || header.length > 8192) return res.status(401).json({ error: 'Valid original session required', errorCode: 'INVALID_ERASURE_SESSION' });
    try { req.verifiedErasureSession = decodeUserSessionJwt(header.slice(7)); return next(); }
    catch (failure) {
        if (failure instanceof jwt.JsonWebTokenError) return res.status(401).json({ error: 'Valid original session required', errorCode: 'INVALID_ERASURE_SESSION' });
        if (failure instanceof JwtConfigurationError) return res.status(503).json({ error: 'Authentication unavailable' });
        return res.status(503).json({ error: 'Authentication unavailable' });
    }
}
function operationFailure(res: Response, failure: unknown) {
    if (failure instanceof AccountSecurityError) return res.status(failure.status).json({ error: 'Account operation rejected', errorCode: failure.status === 409 ? 'ERASURE_ABANDONED' : failure.status === 401 ? 'INVALID_CREDENTIALS' : 'INVALID_INPUT' });
    console.error('Account erasure operation unavailable; credentials and asset details withheld');
    return res.status(503).json({ error: 'Account operation unavailable', errorCode: 'ERASURE_UNAVAILABLE' });
}
export async function deleteMyAccount(req: AuthRequest, res: Response) {
    const claims = req.verifiedErasureSession;
    if (!claims) return res.status(401).json({ error: 'Valid original session required' });
    try {
        if (Object.keys(req.query).length) throw new AccountSecurityError();
        const body = securityBody(req.body, ['currentPassword', 'clientActionId', 'confirmation']);
        if (body.confirmation !== 'DELETE_MY_ACCOUNT' || typeof body.clientActionId !== 'string') throw new AccountSecurityError();
        return res.json(await eraseAccountData(claims.id, claims.authVersion, body.currentPassword, body.clientActionId));
    } catch (failure) { return operationFailure(res, failure); }
}
export async function getMyErasureReceipt(req: AuthRequest, res: Response) {
    const claims = req.verifiedErasureSession;
    if (!claims) return res.status(401).json({ error: 'Valid original session required' });
    try {
        if (Object.keys(req.query).length || Object.keys(req.body ?? {}).length) throw new AccountSecurityError();
        const receipt = await readAccountErasureReceipt(claims.id, claims.authVersion, req.params.clientActionId as string);
        return receipt ? res.json(receipt) : res.status(404).json({ error: 'Operation not found', errorCode: 'UNKNOWN_ERASURE_OPERATION' });
    } catch (failure) { return operationFailure(res, failure); }
}
export async function abandonMyErasure(req: AuthRequest, res: Response) {
    const claims = req.verifiedErasureSession;
    if (!claims) return res.status(401).json({ error: 'Valid original session required' });
    try {
        if (Object.keys(req.query).length) throw new AccountSecurityError();
        securityBody(req.body ?? {}, []);
        return res.json(await abandonAccountErasure(claims.id, claims.authVersion, req.params.clientActionId as string));
    } catch (failure) { return operationFailure(res, failure); }
}

export async function getAccountDeletionImpact(req: AuthRequest, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    // No target account, cursor, dates or filters can be supplied by the client.
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Invalid input', errorCode: 'INVALID_INPUT' });
    try { return res.json(await readAccountDeletionImpact(req.user.id)); }
    catch (failure) {
        if (failure instanceof AccountSecurityError) return res.status(failure.status).json({ error: 'Account preview rejected' });
        console.error('Account deletion preview unavailable; database and user details withheld');
        return res.status(503).json({ error: 'Account preview unavailable' });
    }
}
