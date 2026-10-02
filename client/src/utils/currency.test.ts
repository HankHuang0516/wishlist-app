import { beforeEach, describe, expect, it } from 'vitest';
import { convertToTWD, formatPriceWithConversion, getSupportedCurrencies, isCurrencySupported } from './currency';

beforeEach(() => localStorage.setItem('user-locale', 'en-US'));
describe('original prices and dated fixed-rate estimates', () => {
  it('preserves cents, trailing zeroes, zero and integers beyond Number precision', () => {
    expect(formatPriceWithConversion('250.75', 'TWD')).toBe('250.75 TWD');
    expect(formatPriceWithConversion('1250.7500', 'NTD')).toBe('1,250.7500 TWD');
    expect(formatPriceWithConversion('0.00', 'TWD')).toBe('0.00 TWD');
    expect(formatPriceWithConversion('9007199254740993.25', 'TWD')).toBe('9,007,199,254,740,993.25 TWD');
    expect(formatPriceWithConversion(1e-7, 'TWD')).toBe('0.0000001 TWD');
  });
  it('labels conversion as an estimate with its existing rate date in both languages', () => {
    expect(formatPriceWithConversion('10.25', 'USD')).toBe('10.25 USD (approx. 328 TWD; fixed-rate estimate, 2026-01-02)');
    localStorage.setItem('user-locale', 'zh-TW');
    expect(formatPriceWithConversion('10.25', 'USD')).toBe('10.25 USD（約 328 TWD；固定匯率估算，2026-01-02）');
  });
  it('converts to the requested local currency instead of labelling every result TWD', () => {
    expect(formatPriceWithConversion('35.00', 'USD', 'EUR')).toBe('35.00 USD (approx. 32 EUR; fixed-rate estimate, 2026-01-02)');
    expect(formatPriceWithConversion('35.00', 'USD', 'XYZ')).toBe('35.00 USD');
    expect(formatPriceWithConversion('35.00', 'XYZ')).toBe('35.00 XYZ');
    expect(convertToTWD(10.25, ' usd ')).toBe(328);
  });
  it.each(['300garbage', '12,34', 'NaN', 'Infinity', '', Number.POSITIVE_INFINITY, Number.NaN])('does not invent a usable price from malformed input %s', value => {
    expect(formatPriceWithConversion(value, 'TWD')).toBe('Price unconfirmed');
  });
  it('accepts legacy currency prefixes and rejects prototype keys and overflow', () => {
    expect(formatPriceWithConversion('NT$ 1,250.75', 'NTD')).toBe('1,250.75 TWD');
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(isCurrencySupported(key)).toBe(false);
      expect(convertToTWD(10, key)).toBeNull();
      expect(formatPriceWithConversion('10.25', key)).toBe('10.25 Currency unconfirmed');
    }
    expect(convertToTWD(Number.MAX_VALUE, 'USD')).toBeNull();
    expect(getSupportedCurrencies()).toContain('TWD');
    expect(getSupportedCurrencies()).not.toContain('NTD');
  });
});
