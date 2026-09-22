import { validateApiUrl } from './api';
import { CATEGORIES, uuid } from './listingForm';
import type { FeatureCollection, Point } from 'geojson';

export type Bounds = [west: number, south: number, east: number, north: number];
export const TAIWAN_BOUNDS: Bounds = [117, 20, 123.8, 26.6];
export type SearchFilters = { q: string; brand: string; category: string; condition: '' | 'NEW' | 'USED'; delivery: '' | 'MEETUP' | 'SHIPPING'; minPrice: string; maxPrice: string };
export const emptySearchFilters: SearchFilters = { q: '', brand: '', category: '', condition: '', delivery: '', minPrice: '', maxPrice: '' };
export class ListingSearchError extends Error {}
export type PublicListing = {
  id: string; title: string; description: string; brand: string; category: string; condition: 'NEW' | 'USED';
  price: number; deliveryMethods: ('MEETUP' | 'SHIPPING')[]; negotiable: boolean; status: 'ACTIVE' | 'RESERVED'; expiresAt: string;
  owner: { id: number; name: string | null };
  location: { county: string; district: string; publicLatitude: number; publicLongitude: number; precisionMeters: number };
  media: { id: string; imageUrl: string; thumbnailUrl: string }[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingSearchError('商品資料回應不正確');
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clip a native viewport, never substitute nationwide results for an outside viewport. */
export function clipBounds(value: unknown): Bounds | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[0] >= value[2] || value[1] >= value[3]) return null;
  const [west, south, east, north] = value as Bounds;
  const clipped: Bounds = [Math.max(117, west), Math.max(20, south), Math.min(123.8, east), Math.min(26.6, north)];
  return clipped[0] < clipped[2] && clipped[1] < clipped[3] ? clipped : null;
}

export function listingSearchPath(filters: SearchFilters, bounds: Bounds, cursor?: string) {
  const bbox = clipBounds(bounds);
  if (!bbox) throw new ListingSearchError('請將地圖移回台灣範圍');
  const params = new URLSearchParams({ limit: '100', bbox: bbox.map(v => String(v)).join(',') });
  const q = filters.q.trim(); const brand = filters.brand.trim();
  if (q.length > 100 || brand.length > 60) throw new ListingSearchError('搜尋文字或品牌過長');
  if (q) params.set('q', q); if (brand) params.set('brand', brand);
  if (filters.category && !CATEGORIES.some(c => c[0] === filters.category)) throw new ListingSearchError('分類不正確');
  if (!['', 'NEW', 'USED'].includes(filters.condition) || !['', 'MEETUP', 'SHIPPING'].includes(filters.delivery)) throw new ListingSearchError('篩選條件不正確');
  for (const key of ['category', 'condition', 'delivery'] as const) if (filters[key]) params.set(key, filters[key]);
  for (const key of ['minPrice', 'maxPrice'] as const) {
    const value = filters[key].trim();
    if (value && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value) || Number(value) > 9_999_999_999.99)) throw new ListingSearchError('價格須為非負數，最多兩位小數');
    if (value) params.set(key, value);
  }
  if (filters.minPrice.trim() && filters.maxPrice.trim() && Number(filters.minPrice) > Number(filters.maxPrice)) throw new ListingSearchError('最高價不可小於最低價');
  if (cursor) { if (!uuid(cursor)) throw new ListingSearchError('分頁識別碼不正確'); params.set('cursor', cursor); }
  // React Native's URLSearchParams implementation leaves these punctuation
  // characters unescaped, unlike the browser implementation used in tests.
  return '/listings?' + params.toString().replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

export function parsePublicListing(value: unknown, apiUrl: string, local = false): PublicListing {
  const row = object(value); const owner = object(row.owner); const location = object(row.location);
  const price = typeof row.price === 'string' && /^\d+(?:\.\d{1,2})?$/.test(row.price) ? Number(row.price) : row.price;
  if (!uuid(row.id) || !text(row.title, 100) || !text(row.description, 3000) || !text(row.brand, 60) || !CATEGORIES.some(c => c[0] === row.category) ||
      !['NEW', 'USED'].includes(row.condition as string) || !finite(price) || price < 0 || price > 9_999_999_999.99 || row.currency !== 'TWD' ||
      !['ACTIVE', 'RESERVED'].includes(row.status as string) || typeof row.negotiable !== 'boolean' || typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt)) ||
      !Number.isSafeInteger(owner.id) || (owner.id as number) < 1 || !(owner.name === null || (typeof owner.name === 'string' && owner.name.length <= 100)) ||
      !text(location.county, 30) || !text(location.district, 30) || !finite(location.publicLatitude) || location.publicLatitude < 20 || location.publicLatitude > 26.6 ||
      !finite(location.publicLongitude) || location.publicLongitude < 117 || location.publicLongitude > 123.8 || !finite(location.precisionMeters) || location.precisionMeters < 1000 ||
      !Array.isArray(row.deliveryMethods) || row.deliveryMethods.length < 1 || row.deliveryMethods.length > 2 || row.deliveryMethods.some(v => !['MEETUP', 'SHIPPING'].includes(v)) || new Set(row.deliveryMethods).size !== row.deliveryMethods.length ||
      !Array.isArray(row.media) || row.media.length < 1 || row.media.length > 8) throw new ListingSearchError('商品資料回應不正確');
  const base = validateApiUrl(apiUrl, local);
  const media = row.media.map(value => {
    const image = object(value);
    if (!uuid(image.id) || image.imageUrl !== `${base}/api/listing-media/${image.id}/image` || image.thumbnailUrl !== `${base}/api/listing-media/${image.id}/thumbnail`) throw new ListingSearchError('商品照片來源不正確');
    return { id: image.id, imageUrl: image.imageUrl as string, thumbnailUrl: image.thumbnailUrl as string };
  });
  if (new Set(media.map(m => m.id)).size !== media.length) throw new ListingSearchError('商品照片重複');
  // Only public allowlisted fields enter map/card state. Ignore profile/private extras.
  return { id: row.id, title: row.title, description: row.description, brand: row.brand, category: row.category as string, condition: row.condition as PublicListing['condition'],
    price, deliveryMethods: row.deliveryMethods as PublicListing['deliveryMethods'], negotiable: row.negotiable, status: row.status as PublicListing['status'], expiresAt: row.expiresAt,
    owner: { id: owner.id as number, name: owner.name as string | null },
    location: { county: location.county, district: location.district, publicLatitude: location.publicLatitude, publicLongitude: location.publicLongitude, precisionMeters: location.precisionMeters }, media };
}
export function parseListingPage(value: unknown, apiUrl: string, local = false, now = Date.now()) {
  const page = object(value);
  if (!Array.isArray(page.items) || page.items.length > 100 || !(page.nextCursor === null || uuid(page.nextCursor))) throw new ListingSearchError('商品分頁回應不正確');
  const rows = page.items.map(item => parsePublicListing(item, apiUrl, local));
  if (new Set(rows.map(item => item.id)).size !== rows.length || (page.nextCursor !== null && (!rows.length || page.nextCursor !== rows[rows.length - 1].id))) throw new ListingSearchError('商品分頁回應不正確');
  return { items: rows.filter(item => Date.parse(item.expiresAt) > now), nextCursor: page.nextCursor as string | null };
}
export function mergeListingPages(previous: PublicListing[], next: PublicListing[]) {
  const rows = new Map(previous.map(item => [item.id, item]));
  for (const item of next) rows.set(item.id, item);
  return [...rows.values()];
}
export function listingGeoJSON(items: PublicListing[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: items.map(item => ({ type: 'Feature', id: item.id,
    geometry: { type: 'Point', coordinates: [item.location.publicLongitude, item.location.publicLatitude] },
    properties: { listingId: item.id, icon: 'photo-' + item.media[0].id, title: item.title } })) };
}
export const listingPrice = (item: PublicListing) => item.price === 0 ? '免費贈送' : 'NT$ ' + new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(item.price);
