/**
 * matchmakingPrice — validation for the price-aware matchmaking fields
 * (card_e1b8af79). Shared by the seller listing write path (askPrice) and the
 * buyer wishlist item path (maxPrice).
 *
 * Rules (Hank's confirmed defaults):
 *   - Price is OPTIONAL. Absent / empty ⇒ { ok, value: null } (no price → the
 *     matchmaker falls back to name/tags-only; we never invent one).
 *   - A present price MUST parse to a finite, NON-NEGATIVE number that is not
 *     absurd (bounded by MAX_PRICE). NaN / negative / non-numeric / over-cap ⇒
 *     { ok: false } (the caller returns 400 — invalid input is rejected, never
 *     silently coerced).
 *   - Currency defaults to TWD and must be a short allowlisted code. Anything
 *     outside the allowlist ⇒ { ok: false }.
 *
 * No money flows through the platform — these are match metadata only (官方不介入).
 */

// Bound the price so a fat-fingered / hostile "1e309" style value can't poison a
// comparison. 1e12 (a trillion) is comfortably above any real consumer price.
export const MAX_PRICE = 1_000_000_000_000;

export const DEFAULT_CURRENCY = 'TWD';

// A deliberately small allowlist of common short currency codes. Kept as an
// allowlist (not a regex) so an attacker can't smuggle control chars / long
// strings into the currency field. Extend intentionally if needed.
export const ALLOWED_CURRENCIES = new Set([
    'TWD', 'USD', 'JPY', 'EUR', 'GBP', 'CNY', 'HKD', 'KRW', 'SGD', 'AUD', 'CAD',
]);

export interface PriceParseResult {
    ok: boolean;
    /** The validated numeric price, or null when no price was supplied. */
    value: number | null;
    error?: string;
}

/**
 * Parse & validate an OPTIONAL price. `raw` may be a number, a numeric string, or
 * null/undefined/''. Returns { ok:true, value:null } for "no price supplied".
 */
export function parseOptionalPrice(raw: unknown): PriceParseResult {
    if (raw === undefined || raw === null || raw === '') {
        return { ok: true, value: null };
    }
    // Reject arrays/objects/booleans outright — only number|string are valid.
    if (typeof raw !== 'number' && typeof raw !== 'string') {
        return { ok: false, value: null, error: 'Price must be a number' };
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) {
        return { ok: false, value: null, error: 'Price must be a finite number' };
    }
    if (n < 0) {
        return { ok: false, value: null, error: 'Price must not be negative' };
    }
    if (n > MAX_PRICE) {
        return { ok: false, value: null, error: 'Price is out of range' };
    }
    return { ok: true, value: n };
}

export interface CurrencyParseResult {
    ok: boolean;
    /** The normalised (upper-cased) currency code. */
    value: string;
    error?: string;
}

/**
 * Parse & validate an OPTIONAL currency code. Absent ⇒ DEFAULT_CURRENCY (TWD).
 * A present value must be in the allowlist (case-insensitive).
 */
export function parseOptionalCurrency(raw: unknown): CurrencyParseResult {
    if (raw === undefined || raw === null || raw === '') {
        return { ok: true, value: DEFAULT_CURRENCY };
    }
    if (typeof raw !== 'string') {
        return { ok: false, value: DEFAULT_CURRENCY, error: 'Currency must be a string' };
    }
    const code = raw.trim().toUpperCase();
    if (!ALLOWED_CURRENCIES.has(code)) {
        return { ok: false, value: DEFAULT_CURRENCY, error: 'Unsupported currency code' };
    }
    return { ok: true, value: code };
}
