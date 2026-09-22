import type { RequestHandler } from 'express';
import { adminHeaderAdmission } from '../lib/adminAdmission';

// New moderation routes must explicitly mount this guard. Existing legacy
// admin endpoints are unchanged; this alone does not retrofit their policy.
export function marketplaceAdmin(getCredential: () => unknown): RequestHandler {
    return (req, res, next) => {
        let configured: unknown;
        try { configured = getCredential(); }
        catch { return res.status(503).json({ error: '管理審核暫時無法使用', errorCode: 'MODERATION_ADMIN_UNAVAILABLE' }); }
        const admission = adminHeaderAdmission(configured, req.headers['x-admin-key']);
        if (admission === 'DISABLED') return res.status(503).json({ error: '管理審核暫時無法使用', errorCode: 'MODERATION_ADMIN_UNAVAILABLE' });
        // A credential in the URL can enter browser history/proxy logs. Never
        // consume it, even when a correct header is also provided.
        if (Object.prototype.hasOwnProperty.call(req.query, 'key')) {
            return res.status(400).json({ error: '請只使用管理授權 header', errorCode: 'MODERATION_ADMIN_HEADER_ONLY' });
        }
        if (admission !== 'AUTHORIZED') return res.status(401).json({ error: '沒有管理審核權限', errorCode: 'MODERATION_ADMIN_DENIED' });
        next();
    };
}
