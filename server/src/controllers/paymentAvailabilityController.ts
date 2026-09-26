import { Response } from 'express';

// Legacy subscription mutation and TapPay sandbox checkout do not verify a
// production transaction. Keep existing entitlements intact; reject new paid
// grants until a separately audited provider receipt flow replaces them.
export function paymentTemporarilyUnavailable(_req: unknown, res: Response) {
    return res.status(503).set('Cache-Control', 'private, no-store').json({
        error: '目前暫停新購買；既有會員權益不受影響。',
        errorCode: 'PAYMENT_VERIFICATION_REQUIRED',
    });
}
