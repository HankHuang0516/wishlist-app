export type RetailReference = {
  price: number;
  priceType: 'MANUFACTURER_MSRP' | 'RETAIL_REGULAR';
  sourceUrl: string;
  sourceTitle: string;
  sourceProductTitle?: string;
  sourcePeriod: string | null;
  checkedAt: string;
};

// Optional price evidence must fail closed without hiding the actual product.
export function parseRetailReference(value: unknown, productKey: string): RetailReference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const r = value as Record<string, unknown>;
  if (r.productKey !== productKey || r.currency !== 'TWD' || typeof r.price !== 'number' ||
      !Number.isFinite(r.price) || r.price <= 0 ||
      !['MANUFACTURER_MSRP', 'RETAIL_REGULAR'].includes(String(r.priceType)) ||
      typeof r.sourceUrl !== 'string' || r.sourceUrl.length > 1800 || r.sourceUrl !== r.sourceUrl.trim() ||
      typeof r.sourceTitle !== 'string' || !r.sourceTitle.trim() || r.sourceTitle.length > 500 ||
      typeof r.checkedAt !== 'string' || !Number.isFinite(Date.parse(r.checkedAt)) ||
      r.sourcePeriod !== null && (typeof r.sourcePeriod !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/.test(r.sourcePeriod))) return;
  try {
    const url = new URL(r.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) ||
        /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return;
    return { price: r.price, priceType: r.priceType as RetailReference['priceType'], sourceUrl: url.href,
      sourceTitle: r.sourceTitle.trim(), sourcePeriod: r.sourcePeriod as string | null, checkedAt: r.checkedAt,
      ...(typeof r.sourceProductTitle === 'string' && r.sourceProductTitle.length <= 500 ? { sourceProductTitle: r.sourceProductTitle } : {}) };
  } catch { return; }
}

export function retailRatio(price: number | null, currency: string | null, unitVerified: boolean, reference?: RetailReference) {
  if (!reference || !Number.isFinite(reference.price) || reference.price <= 0 || currency !== 'TWD' || !unitVerified || price === null || !Number.isFinite(price) || price < 0) return;
  const ratio = price / reference.price * 10;
  return Number.isFinite(ratio) ? ratio : undefined;
}

export function retailLabel(ratio: number) {
  const number = (n: number) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 1 }).format(n);
  if (ratio === 0) return '免費贈送 · 查看原價參考';
  if (ratio < 0.1) return '低於參考原價的 0.1 折';
  if (ratio >= 10) return ratio === 10 ? '與參考原價相同' : '高於參考原價';
  if (Math.round(ratio * 10) === 100) return '接近參考原價';
  return `約參考原價 ${number(ratio)} 折`;
}
