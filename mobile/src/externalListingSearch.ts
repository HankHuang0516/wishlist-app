import type { FeatureCollection, Point } from 'geojson';
import { clipBounds, ListingSearchError, type Bounds, type SearchFilters } from './listingSearch';
import { uuid } from './listingForm';

export type ExternalListing = {
  id: string; title: string; description: string; condition: 'USED'; priceTwd: number;
  county: '臺北市' | '新北市'; district: string; imageUrl: string; thumbnailUrl: string; canonicalUrl: string;
  observedAt: string; expiresAt: string;
  location: { latitude: number; longitude: number; precision: 'DISTRICT_CENTER'; source: 'https://data.gov.tw/dataset/25489' };
  source: { host: string; imageHost: string; kind: 'PARTNER_FEED' | 'LINE_OPT_IN' | 'SELLER_IMPORT' };
  locationPrecision: 'DISTRICT_ONLY'; priceSource: 'SOURCE_STATED'; inAppSeller: false; aiDerivedPublicFields: false;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingSearchError('外部商品資料不正確');
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const host = (value: unknown): value is string => typeof value === 'string' &&
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) && value.length <= 253;
const externalUrl = (value: unknown, expectedHost: string) => {
  if (typeof value !== 'string' || value.length > 2048) throw new ListingSearchError('外部商品連結不正確');
  let url: URL;
  try { url = new URL(value); } catch { throw new ListingSearchError('外部商品連結不正確'); }
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.username || url.password ||
      url.port || url.hash || url.pathname === '/') throw new ListingSearchError('外部商品連結不正確');
  return url.href;
};

export function parseExternalListing(value: unknown, now = Date.now()): ExternalListing {
  const row = object(value), source = object(row.source), location = object(row.location);
  if (!uuid(row.id) || !text(row.title, 120) || !text(row.description, 1500) || row.condition !== 'USED' ||
      !['臺北市', '新北市'].includes(String(row.county)) || !text(row.district, 12) ||
      !host(source.host) || !host(source.imageHost) ||
      !['PARTNER_FEED', 'LINE_OPT_IN', 'SELLER_IMPORT'].includes(String(source.kind)) ||
      row.locationPrecision !== 'DISTRICT_ONLY' || row.priceSource !== 'SOURCE_STATED' ||
      row.inAppSeller !== false || row.aiDerivedPublicFields !== false ||
      location.precision !== 'DISTRICT_CENTER' || location.source !== 'https://data.gov.tw/dataset/25489' ||
      typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) ||
      typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) ||
      location.latitude < 24.7 || location.latitude > 25.4 || location.longitude < 121.2 || location.longitude > 122.1 ||
      typeof row.observedAt !== 'string' || typeof row.expiresAt !== 'string')
    throw new ListingSearchError('外部商品資料不正確');
  const price = typeof row.priceTwd === 'string' && /^\d{1,8}(?:\.\d{1,2})?$/.test(row.priceTwd) ? Number(row.priceTwd) : NaN;
  const observedAt = Date.parse(row.observedAt), expiresAt = Date.parse(row.expiresAt);
  if (!Number.isFinite(price) || price < 1 || price > 10_000_000 || !Number.isFinite(observedAt) ||
      !Number.isFinite(expiresAt) || observedAt > now + 5 * 60_000 || now - observedAt > 48 * 3_600_000 ||
      expiresAt <= now || expiresAt > observedAt + 30 * 86_400_000)
    throw new ListingSearchError('外部商品已失效或資料不正確');
  const canonicalUrl = externalUrl(row.canonicalUrl, source.host);
  const imageUrl = externalUrl(row.imageUrl, source.imageHost);
  const thumbnailUrl = externalUrl(row.thumbnailUrl, source.imageHost);
  if (thumbnailUrl === imageUrl) throw new ListingSearchError('來源縮圖與原圖不可相同');
  return { id: row.id, title: row.title, description: row.description, condition: 'USED', priceTwd: price,
    county: row.county as ExternalListing['county'], district: row.district, imageUrl, thumbnailUrl, canonicalUrl,
    observedAt: row.observedAt, expiresAt: row.expiresAt,
    location: { latitude: location.latitude, longitude: location.longitude,
      precision: 'DISTRICT_CENTER', source: 'https://data.gov.tw/dataset/25489' },
    source: { host: source.host, imageHost: source.imageHost, kind: source.kind as ExternalListing['source']['kind'] },
    locationPrecision: 'DISTRICT_ONLY', priceSource: 'SOURCE_STATED', inAppSeller: false,
    aiDerivedPublicFields: false };
}

export function parseExternalListingPage(value: unknown, now = Date.now()) {
  const page = object(value);
  if (typeof page.enabled !== 'boolean' || !Array.isArray(page.items) || page.items.length > 100 ||
      !(page.nextCursor === null || uuid(page.nextCursor)) ||
      (!page.enabled && (page.items.length !== 0 || page.nextCursor !== null)))
    throw new ListingSearchError('外部商品分頁不正確');
  const items = page.items.map(item => parseExternalListing(item, now));
  if (new Set(items.map(item => item.id)).size !== items.length ||
      (page.nextCursor !== null && (!items.length || page.nextCursor !== items[items.length - 1].id)))
    throw new ListingSearchError('外部商品分頁不正確');
  return { enabled: page.enabled, items, nextCursor: page.nextCursor as string | null };
}

// Brand, category and delivery are not source-verified for external supply.
// Hide external results instead of pretending those filters matched.
export function externalSearchPath(filters: SearchFilters, bounds: Bounds, cursor?: string): string | null {
  const box = clipBounds(bounds);
  if (!box) return null;
  if (filters.condition === 'NEW' || filters.brand.trim() || filters.category || filters.delivery) return null;
  const q = filters.q.trim();
  if (q.length > 80) return null;
  const prices = [filters.minPrice.trim(), filters.maxPrice.trim()];
  if (prices.some(price => price && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(price) || Number(price) > 10_000_000))) return null;
  if (prices[0] && prices[1] && Number(prices[0]) > Number(prices[1])) return null;
  const params = new URLSearchParams({ limit: '100', bbox: box.map(value => value.toFixed(5)).join(',') });
  if (q) params.set('q', q);
  if (prices[0]) params.set('minPrice', prices[0]);
  if (prices[1]) params.set('maxPrice', prices[1]);
  if (cursor) { if (!uuid(cursor)) throw new ListingSearchError('外部商品分頁識別碼不正確'); params.set('cursor', cursor); }
  return '/external-listings?' + params.toString().replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

export function externalGeoJSON(items: ExternalListing[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: items.map(item => ({ type: 'Feature', id: item.id,
    geometry: { type: 'Point', coordinates: [item.location.longitude, item.location.latitude] },
    properties: { externalId: item.id, icon: 'external-' + item.id, title: item.title } })) };
}

export const externalPrice = (item: ExternalListing) =>
  '來源售價 NT$ ' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(item.priceTwd);
