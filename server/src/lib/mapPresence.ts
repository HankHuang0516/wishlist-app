import { ListingInputError } from './listingRules';

export const MAP_CHECK_IN_MS = 60 * 60 * 1000;
export function mapPresenceBody(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingInputError('body');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(key => !['expectedVersion', 'display', 'consentToMap'].includes(key)) ||
        !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 || Number(body.expectedVersion) > 2147483646 ||
        typeof body.display !== 'boolean' || (body.consentToMap !== undefined && typeof body.consentToMap !== 'boolean') ||
        (body.display && body.consentToMap !== true)) throw new ListingInputError('consentToMap', '請明確同意這次地圖顯示，或選擇不顯示');
    return { expectedVersion: Number(body.expectedVersion), display: body.display };
}
export function mapPresenceUntil(display: boolean, now: Date, expiresAt: Date) {
    return display ? new Date(Math.min(now.getTime() + MAP_CHECK_IN_MS, expiresAt.getTime())) : null;
}
