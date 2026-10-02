import { getDisplayLocale } from './localization';

/**
 * Currency Conversion Utility
 * Provides exchange rate conversion and price formatting
 */

// Fixed exchange rates (relative to TWD)
// Updated: 2026-01-02
const EXCHANGE_RATES: Record<string, number> = {
    // Base
    TWD: 1,
    NTD: 1, // Alias for TWD

    // Major currencies
    USD: 32,      // 1 USD ≈ 32 TWD
    EUR: 35,      // 1 EUR ≈ 35 TWD
    JPY: 0.22,    // 1 JPY ≈ 0.22 TWD
    GBP: 40,      // 1 GBP ≈ 40 TWD

    // Asian currencies
    CNY: 4.4,     // 1 CNY ≈ 4.4 TWD
    KRW: 0.024,   // 1 KRW ≈ 0.024 TWD
    HKD: 4.1,     // 1 HKD ≈ 4.1 TWD
    SGD: 23.5,    // 1 SGD ≈ 23.5 TWD
    MYR: 7.2,     // 1 MYR ≈ 7.2 TWD
    THB: 0.92,    // 1 THB ≈ 0.92 TWD
    VND: 0.0013,  // 1 VND ≈ 0.0013 TWD
    PHP: 0.57,    // 1 PHP ≈ 0.57 TWD
    IDR: 0.002,   // 1 IDR ≈ 0.002 TWD
    INR: 0.38,    // 1 INR ≈ 0.38 TWD

    // Other major currencies
    AUD: 21,      // 1 AUD ≈ 21 TWD
    CAD: 23,      // 1 CAD ≈ 23 TWD
    CHF: 36,      // 1 CHF ≈ 36 TWD
    NZD: 19,      // 1 NZD ≈ 19 TWD
    SEK: 3,       // 1 SEK ≈ 3 TWD
    NOK: 2.9,     // 1 NOK ≈ 2.9 TWD
    DKK: 4.7,     // 1 DKK ≈ 4.7 TWD
    RUB: 0.35,    // 1 RUB ≈ 0.35 TWD
    BRL: 5.3,     // 1 BRL ≈ 5.3 TWD
    MXN: 1.9,     // 1 MXN ≈ 1.9 TWD
    AED: 8.7,     // 1 AED ≈ 8.7 TWD
    SAR: 8.5,     // 1 SAR ≈ 8.5 TWD
};

/**
 * Parse price string to number
 */
function parsePrice(price: string | number): { amount: string; value: number } | null {
    if (typeof price === 'number' && !Number.isFinite(price)) return null;
    let text = String(price).trim().replace(/^(?:NT\$|[$¥€£₩₹฿₫₱])\s*/, '');
    // Expand a numeric exponent without rounding the number's canonical digits.
    if (typeof price === 'number' && /e/i.test(text)) {
        const [coefficient, exponent] = text.toLowerCase().split('e');
        const sign = coefficient.startsWith('-') ? '-' : '';
        const parts = coefficient.replace(/^-/, '').split('.');
        const digits = parts.join('');
        const point = parts[0].length + Number(exponent);
        text = sign + (point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
    }
    if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
    const amount = text.replace(/,/g, '');
    const value = Number(amount);
    return Number.isFinite(value) ? { amount, value } : null;
}

function normalizeCurrency(currency: string) {
    const code = currency.trim().toUpperCase();
    return code === 'NTD' ? 'TWD' : code;
}

function rateFor(currency: string): number | null {
    const code = normalizeCurrency(currency);
    return Object.hasOwn(EXCHANGE_RATES, code) ? EXCHANGE_RATES[code] : null;
}

function formatOriginal(amount: string) {
    const [whole, fraction] = amount.split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
}

/**
 * Format number with thousands separator
 */
function formatNumber(num: number): string {
    return num.toLocaleString('en-US', {
        maximumFractionDigits: 0,
    });
}

/**
 * Convert price from one currency to TWD
 */
export function convertToTWD(price: number, fromCurrency: string): number | null {
    const rate = rateFor(fromCurrency);
    if (rate === null || !Number.isFinite(price)) return null;
    const converted = price * rate;
    return Number.isFinite(converted) ? Math.round(converted) : null;
}

/**
 * Format price with currency and TWD conversion
 * @param price - Price value (string or number)
 * @param currency - Currency code (e.g., 'USD', 'JPY')
 * @param localCurrency - Local currency to convert to (default: 'TWD')
 * @returns Formatted string like "100 USD (約 3,200 TWD)"
 */
export function formatPriceWithConversion(
    price: string | number,
    currency: string = 'TWD',
    localCurrency: string = 'TWD'
): string {
    const parsed = parsePrice(price);
    const zh = getDisplayLocale().startsWith('zh');
    if (parsed === null) return zh ? '價格未確認' : 'Price unconfirmed';
    const normalizedCurrency = normalizeCurrency(currency);
    const normalizedLocal = normalizeCurrency(localCurrency);
    const original = `${formatOriginal(parsed.amount)} ${/^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : zh ? '幣別未確認' : 'Currency unconfirmed'}`;
    if (normalizedCurrency === normalizedLocal) return original;
    const fromRate = rateFor(normalizedCurrency), toRate = rateFor(normalizedLocal);
    if (fromRate === null || toRate === null) return original;
    const converted = parsed.value * fromRate / toRate;
    if (!Number.isFinite(converted)) return original;
    const estimate = `${formatNumber(Math.round(converted))} ${normalizedLocal}`;
    return original + (zh ? `（約 ${estimate}；固定匯率估算，2026-01-02）` : ` (approx. ${estimate}; fixed-rate estimate, 2026-01-02)`);
}

/**
 * Get list of supported currencies
 */
export function getSupportedCurrencies(): string[] {
    return Object.keys(EXCHANGE_RATES).filter(c => c !== 'NTD'); // Exclude alias
}

/**
 * Check if a currency is supported
 */
export function isCurrencySupported(currency: string): boolean {
    return rateFor(currency) !== null;
}
