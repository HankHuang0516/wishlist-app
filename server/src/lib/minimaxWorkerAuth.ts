import { timingSafeEqual } from 'crypto';

export function minimaxPilotUserId() {
    const id = Number(process.env.MINIMAX_PILOT_USER_ID);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function minimaxWorkerToken() {
    const token = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
    return token && token.length >= 32 ? token : null;
}

export function isMinimaxWorker(header: string | undefined) {
    const token = minimaxWorkerToken();
    if (!token || !header?.startsWith('Bearer ')) return false;
    const actual = Buffer.from(header.slice(7)), expected = Buffer.from(token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function listingAiEnabledFor(userId: number) {
    if (!minimaxWorkerToken() || process.env.MINIMAX_LISTING_AI_ENABLED !== '1') return false;
    const pilot = process.env.MINIMAX_LISTING_AI_PILOT_USER_ID;
    return pilot === undefined || Number.isSafeInteger(Number(pilot)) && Number(pilot) > 0 && pilot === String(userId);
}

export function listingAiPilotUserId() {
    const raw = process.env.MINIMAX_LISTING_AI_PILOT_USER_ID;
    if (raw === undefined) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 && String(id) === raw ? id : -1;
}
