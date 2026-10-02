import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { decodeUserSessionJwt, JwtConfigurationError } from '../lib/jwtConfig';
import { emailDiagnosticsAllowed, emailDiagnosticsEnabled } from '../lib/emailDiagnostics';
import { sendEmail } from '../lib/emailService';
import { AuthRequest } from '../middleware/auth';

/** This admin-only tool requires a live user session, not an integration key. */
export async function authenticateEmailDiagnostics(req: AuthRequest, res: Response, next: NextFunction) {
    const match = /^Bearer ([^\s]{1,8192})$/.exec(req.get('Authorization') ?? '');
    if (!match || req.get('X-Api-Key') !== undefined) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
    try {
        const claims = decodeUserSessionJwt(match[1]);
        const user = await prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, authVersion: true } });
        if (!user || user.authVersion !== claims.authVersion) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
        req.user = { id: user.id };
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
        // Configuration and storage errors never reveal credentials or details.
        if (error instanceof JwtConfigurationError) return res.status(503).json({ errorCode: 'EMAIL_DIAGNOSTICS_UNAVAILABLE' });
        return res.status(503).json({ errorCode: 'EMAIL_DIAGNOSTICS_UNAVAILABLE' });
    }
}

export function getEmailDiagnosticsCapability(req: AuthRequest, res: Response) {
    if (Object.keys(req.query).length) return res.status(400).json({ errorCode: 'EMAIL_DIAGNOSTICS_INVALID_REQUEST' });
    const id = req.user!.id;
    return res.json({ userId: id, canSend: emailDiagnosticsAllowed(id) && emailDiagnosticsEnabled() });
}

export function requireEmailDiagnosticsAdmission(req: AuthRequest, res: Response, next: NextFunction) {
    if (!emailDiagnosticsAllowed(req.user!.id)) return res.status(403).json({ errorCode: 'EMAIL_DIAGNOSTICS_DENIED' });
    if (!emailDiagnosticsEnabled()) return res.status(503).json({ errorCode: 'EMAIL_DIAGNOSTICS_DISABLED' });
    if (Object.keys(req.query).length || req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
        return res.status(400).json({ errorCode: 'EMAIL_DIAGNOSTICS_INVALID_REQUEST' });
    }
    next();
}

// Process-local in-flight protection stays until the actual provider promise
// settles, even if the HTTP deadline expires. This is not durable mail history.
const inFlight = new Set<number>();
export async function sendEmailDiagnostic(req: AuthRequest, res: Response) {
    const id = req.user!.id;
    if (inFlight.has(id)) return res.status(429).json({ errorCode: 'EMAIL_DIAGNOSTICS_BUSY' });
    inFlight.add(id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dispatched = false;
    try {
        // Recheck revocation and current operator admission immediately before
        // dispatch. In-flight mail cannot subsequently be withdrawn by logout.
        const match = /^Bearer ([^\s]{1,8192})$/.exec(req.get('Authorization') ?? '');
        if (!match) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
        const claims = decodeUserSessionJwt(match[1]);
        if (claims.id !== id) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
        const user = await prisma.user.findUnique({ where: { id }, select: { authVersion: true } });
        if (!user || user.authVersion !== claims.authVersion) return res.status(401).json({ errorCode: 'EMAIL_DIAGNOSTICS_AUTH_REQUIRED' });
        if (!emailDiagnosticsAllowed(id)) return res.status(403).json({ errorCode: 'EMAIL_DIAGNOSTICS_DENIED' });
        if (!emailDiagnosticsEnabled()) return res.status(503).json({ errorCode: 'EMAIL_DIAGNOSTICS_DISABLED' });
        dispatched = true;
        const pending = Promise.resolve().then(() => sendEmail('hankhuang0516@gmail.com', 'Live Debug Test Email', '<p>This is a manual test triggered from Settings Page. <br>System Status: <b>Online</b></p>'));
        // Attach both handlers before racing, so late rejection is bounded and
        // releases the slot without an unhandled rejection or second response.
        const settled = pending.then(value => { inFlight.delete(id); return value; }, () => { inFlight.delete(id); return null; });
        const result = await Promise.race([settled, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8000); })]);
        if (result?.success === true && typeof result.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.id)) return res.json({ success: true, notificationStatus: 'ACCEPTED' });
        return res.status(503).json({ success: false, errorCode: 'EMAIL_DIAGNOSTICS_UNCONFIRMED' });
    } catch {
        return res.status(503).json({ errorCode: 'EMAIL_DIAGNOSTICS_UNAVAILABLE' });
    } finally {
        if (timer) clearTimeout(timer);
        // A timeout must not release an unresolved provider.
        if (!dispatched) inFlight.delete(id);
    }
}
