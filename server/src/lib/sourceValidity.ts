// Hank selected 14 days for these source/research windows on 2026-10-27.
export const SOURCE_VALIDITY_MS = 14 * 86_400_000;

// Earlier importers generated a 48-hour deadline. Reinterpret only that exact
// legacy shape; retain independently supplied earlier permission deadlines.
export function sourcePhotoExpiry(media: { checkedAt: string; permissionExpiresAt: string },
    row: { checkedAt?: Date | string | null; evidence: unknown }): number {
    const expiry = Date.parse(media.permissionExpiresAt);
    const inventory = (row.evidence as { photoInventory?: { checkedAt?: string } } | null)?.photoInventory;
    for (const check of [media.checkedAt, row.checkedAt, inventory?.checkedAt]) {
        const time = check instanceof Date ? +check : typeof check === 'string' ? Date.parse(check) : NaN;
        if (Number.isFinite(time) && expiry === time + 48 * 3_600_000) return time + SOURCE_VALIDITY_MS;
    }
    return expiry;
}
