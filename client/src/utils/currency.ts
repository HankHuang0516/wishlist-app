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
function parsePrice(priceStr: string | number): number | null {
    if (typeof priceStr === 'number') return priceStr;
    if (!priceStr) return null;

    // Remove currency symbols, commas, spaces
    const cleaned = priceStr.replace(/[NT$,¥€£₩₹฿₫₱\s]/g, '');
    const num = parseFloat(cleaned);

    return isNaN(num) ? null : num;
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
    const normalizedCurrency = fromCurrency.toUpperCase().trim();
    const rate = EXCHANGE_RATES[normalizedCurrency];

    if (rate === undefined) return null;

    return Math.round(price * rate);
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
    const numPrice = parsePrice(price);
    if (numPrice === null) return 'Unknown';

    const normalizedCurrency = currency.toUpperCase().trim();
    const normalizedLocal = localCurrency.toUpperCase().trim();

    // Format the original price
    const formattedPrice = formatNumber(numPrice);

    // If same as local currency, no conversion needed
    if (normalizedCurrency === normalizedLocal ||
        (normalizedCurrency === 'NTD' && normalizedLocal === 'TWD') ||
        (normalizedCurrency === 'TWD' && normalizedLocal === 'NTD')) {
        return `${formattedPrice} ${normalizedCurrency === 'NTD' ? 'TWD' : normalizedCurrency}`;
    }

    // Convert to local currency
    const convertedPrice = convertToTWD(numPrice, normalizedCurrency);

    if (convertedPrice === null) {
        // Unknown currency, just display as-is
        return `${formattedPrice} ${normalizedCurrency}`;
    }

    const formattedConverted = formatNumber(convertedPrice);
    return `${formattedPrice} ${normalizedCurrency} (約 ${formattedConverted} TWD)`;
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
    return currency.toUpperCase().trim() in EXCHANGE_RATES;
}
