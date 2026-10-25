import type { RetailConversion, RetailPriceReference } from './discovery';

export function retailComparison(reference?: RetailPriceReference, conversion?: RetailConversion,
  currentPrice?: number | null, currency: string | null = 'TWD', unitVerified = false) {
  if (!reference || !Number.isFinite(reference.price) || reference.price <= 0) return;
  if (!['MANUFACTURER_MSRP', 'RETAIL_REGULAR'].includes(reference.priceType) ||
      !reference.sourceTitle?.trim() || !Number.isFinite(Date.parse(reference.checkedAt))) return;
  try {
    const url = new URL(reference.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) ||
        /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return;
  } catch { return; }
  let ratio: number;
  if (currentPrice !== undefined) {
    if (currentPrice === null || !Number.isFinite(currentPrice) || currentPrice < 0 || currency !== 'TWD' || !unitVerified) return;
    ratio = currentPrice / reference.price * 10;
  } else {
    if (!conversion || conversion.originalPrice !== reference.price || !Number.isFinite(conversion.priceRatio) || conversion.priceRatio < 0) return;
    ratio = conversion.priceRatio;
  }
  return Number.isFinite(ratio) ? { ratio, free: currentPrice === 0 } : undefined;
}

export function retailComparisonLabel(ratio: number, free: boolean, locale: string) {
  const zh = locale.startsWith('zh');
  const number = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  if (free) return zh ? '免費贈送 · 查看原價參考' : 'Free item · price reference';
  if (ratio < 0.1) return zh ? '低於參考原價的 0.1 折' : 'Below 1% of reference price';
  if (ratio === 10) return zh ? '與參考原價相同' : 'Same as reference price';
  if (ratio > 10) return zh ? '高於參考原價' : 'Above reference price';
  if (zh && Math.round(ratio * 10) === 100) return '接近參考原價';
  return zh ? `約參考原價 ${number(ratio)} 折` : `About ${number(ratio * 10)}% of reference price`;
}
