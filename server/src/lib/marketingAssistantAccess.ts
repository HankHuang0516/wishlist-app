import { createHash } from 'crypto';
import { minimaxWorkerToken } from './minimaxWorkerAuth';

export class MarketingInputError extends Error {
    constructor(public readonly code: string, public readonly status = 400, message = '行銷小助手資料不正確') { super(message); }
}

export function marketingEnabledFor(userId: number) {
    if (process.env.MARKETING_ASSISTANT_ENABLED !== '1' || !minimaxWorkerToken()) return false;
    const pilot = process.env.MARKETING_ASSISTANT_PILOT_USER_ID;
    return !pilot || (/^[1-9]\d{0,9}$/.test(pilot) && Number(pilot) === userId);
}

export function marketingRequestId(value: unknown) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
        throw new MarketingInputError('INVALID_REQUEST_ID');
    return value.toLowerCase();
}

export function marketingSnapshotHash(input: unknown) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function marketingRevisionPrompt(value: unknown) {
    if (typeof value !== 'string' || value.trim().length < 3 || value.length > 500 ||
        /[\u0000-\u001f\u007f]/.test(value)) throw new MarketingInputError('INVALID_REVISION_PROMPT');
    return value.trim();
}
