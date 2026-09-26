import { Response } from 'express';

// The legacy checkout and subscription controls do not verify a production
// payment or cancel one with its provider. Preserve existing entitlements
// until a separately audited purchase/restore/cancellation flow replaces them.
export function paymentTemporarilyUnavailable(_req: unknown, res: Response) {
    return res.status(503).set('Cache-Control', 'private, no-store').json({
        error: '目前暫停購買與訂閱操作；既有會員權益不受影響。',
        errorCode: 'PAYMENT_VERIFICATION_REQUIRED',
    });
}
