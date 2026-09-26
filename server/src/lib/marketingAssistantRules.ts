// Marketing Assistant has its own allowance. Legacy wish-recognition usage and
// mutable User.isPremium must never be used to grant paid generations.
export const MARKETING_FREE_MONTHLY_LIMIT = 3;
export const MARKETING_PREMIUM_PERIOD_LIMIT = 100;
export const MARKETING_CREDIT_PACK_SIZE = 10;
export const MARKETING_MIN_IMAGE_COUNT = 4;
export const MARKETING_FREE_REVISION_MS = 7 * 24 * 60 * 60 * 1000;

export type AllowanceWindow = { startsAt: Date; endsAt: Date; limit: number };

function validDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
}

/** Taiwan has UTC+08:00 with no daylight-saving transition in this period. */
export function freeMarketingWindow(at: Date): AllowanceWindow {
    if (!validDate(at)) throw new Error('INVALID_MARKETING_TIME');
    const taipei = new Date(at.getTime() + 8 * 60 * 60 * 1000);
    const year = taipei.getUTCFullYear(), month = taipei.getUTCMonth();
    return {
        startsAt: new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000),
        endsAt: new Date(Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000),
        limit: MARKETING_FREE_MONTHLY_LIMIT,
    };
}

/** The bounds must come from a verified billing period, never client input. */
export function premiumMarketingWindow(at: Date, verifiedStart: Date, verifiedEnd: Date): AllowanceWindow | null {
    if (![at, verifiedStart, verifiedEnd].every(validDate) || verifiedStart >= verifiedEnd) {
        throw new Error('INVALID_VERIFIED_BILLING_PERIOD');
    }
    if (at < verifiedStart || at >= verifiedEnd) return null;
    return { startsAt: new Date(verifiedStart), endsAt: new Date(verifiedEnd), limit: MARKETING_PREMIUM_PERIOD_LIMIT };
}

export function freeRevisionDeadline(completedAt: Date): Date {
    if (!validDate(completedAt)) throw new Error('INVALID_MARKETING_TIME');
    return new Date(completedAt.getTime() + MARKETING_FREE_REVISION_MS);
}

export function mayRequestFreeRevision(completedAt: Date, now: Date, alreadyUsed: boolean): boolean {
    if (!validDate(now)) throw new Error('INVALID_MARKETING_TIME');
    return !alreadyUsed && now >= completedAt && now < freeRevisionDeadline(completedAt);
}

/** A revision replaces only selected output slots, retaining all other images. */
export function selectedRevisionImages(existingIds: readonly string[], requestedIds: readonly string[]): string[] {
    if (existingIds.length < MARKETING_MIN_IMAGE_COUNT || requestedIds.length === 0 || requestedIds.length > existingIds.length) {
        throw new Error('INVALID_MARKETING_SELECTION');
    }
    const existing = new Set(existingIds), requested = new Set(requestedIds);
    if (existing.size !== existingIds.length || requested.size !== requestedIds.length ||
        requestedIds.some(id => !id || !existing.has(id))) throw new Error('INVALID_MARKETING_SELECTION');
    return [...requestedIds];
}

/** Only durable, distinct assets plus nonempty copy count as a completed job. */
export function marketingDeliveryComplete(imageIds: readonly string[], copy: string): boolean {
    return imageIds.length >= MARKETING_MIN_IMAGE_COUNT &&
        imageIds.every(id => typeof id === 'string' && id.length > 0) &&
        new Set(imageIds).size === imageIds.length &&
        typeof copy === 'string' && copy.trim().length > 0;
}
