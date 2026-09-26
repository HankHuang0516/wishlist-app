import { uuid } from './listingForm';
import { Bounds, PublicListing, SearchFilters, clipBounds, listingSearchPath, parsePublicListing } from './listingSearch';
export class WishDataError extends Error { constructor(message = '願望配對資料不正確') { super(message); } }
export type MatchWish = { id: number; name: string; maxPrice: number | null; priceCurrency: string | null; wishlist: { id: number; title: string; isPublic: boolean } };
export type WishMatch = { wishItemId: number; listing: PublicListing; score: number; reasons: { code: string; text: string }[]; budget: 'WITHIN' | 'UNSPECIFIED' | 'CURRENCY_UNKNOWN'; distanceKm: number | null };
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new WishDataError(); return v as Record<string, unknown>; };
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
export function parseMatchWishes(v: unknown) {
  const p = object(v); if (!Array.isArray(p.items) || p.items.length > 100 || !(p.nextCursor === null || id(p.nextCursor))) throw new WishDataError();
  const items = p.items.map(v => {
    const w = object(v), list = object(w.wishlist);
    if (!id(w.id) || !text(w.name, 200) || !(w.maxPrice === null || (typeof w.maxPrice === 'number' && Number.isFinite(w.maxPrice) && w.maxPrice >= 0 && w.maxPrice <= 1e12)) || !(w.priceCurrency === null || (typeof w.priceCurrency === 'string' && /^[A-Z]{3}$/.test(w.priceCurrency))) || !id(list.id) || !text(list.title, 200) || typeof list.isPublic !== 'boolean') throw new WishDataError();
    return { id: w.id, name: w.name, maxPrice: w.maxPrice as number | null, priceCurrency: w.priceCurrency as string | null, wishlist: { id: list.id, title: list.title, isPublic: list.isPublic } };
  });
  if (new Set(items.map(w => w.id)).size !== items.length || (p.nextCursor !== null && p.nextCursor !== items.at(-1)?.id)) throw new WishDataError();
  return { items, nextCursor: p.nextCursor as number | null };
}
export function wishMatchPath(wishItemId: number, filters: SearchFilters, bounds: Bounds, radiusKm = '', includeOwnPreview = false) {
  if (!id(wishItemId)) throw new WishDataError();
  let path = '/listings/matches?wishItemId=' + wishItemId + '&' + listingSearchPath(filters, bounds).split('?')[1];
  if (includeOwnPreview) path += '&includeOwnPreview=1';
  if (radiusKm.trim()) {
    const radius = radiusKm.trim(); if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(radius) || Number(radius) < 0.5 || Number(radius) > 200) throw new WishDataError('距離須為0.5至200公里');
    const clipped = clipBounds(bounds); if (!clipped) throw new WishDataError();
    const latitude = Math.min(26.59, Math.floor(((clipped[1] + clipped[3]) / 2) / 0.02) * 0.02 + 0.01), longitude = Math.min(123.79, Math.floor(((clipped[0] + clipped[2]) / 2) / 0.02) * 0.02 + 0.01);
    path += `&center=${latitude.toFixed(2)},${longitude.toFixed(2)}&radiusKm=${radius}`;
  }
  return path;
}
const codes = ['NAME', 'BRAND', 'CATEGORY', 'CONDITION', 'DELIVERY', 'BUDGET', 'BUDGET_UNKNOWN', 'DISTANCE', 'RECENTLY_VERIFIED', 'FRESH'];
export function parseWishMatchPage(v: unknown, wishItemId: number, apiUrl: string, local = false, now = Date.now()) {
  if (!id(wishItemId) || !Number.isFinite(now)) throw new WishDataError(); const p = object(v);
  if (!Array.isArray(p.items) || p.items.length > 100 || !(p.nextCursor === null || uuid(p.nextCursor)) || !Number.isInteger(p.scannedCandidates) || (p.scannedCandidates as number) < p.items.length || (p.scannedCandidates as number) > 100 || p.ordering !== 'RECENT_CANDIDATES_PAGE_SCORE' || !text(p.notice, 300)) throw new WishDataError();
  const items = p.items.map(v => {
    const m = object(v); const listing = parsePublicListing(m.listing, apiUrl, local);
    if (m.wishItemId !== wishItemId || typeof m.score !== 'number' || !Number.isInteger(m.score) || m.score < 0 || m.score > 100 || !['WITHIN', 'UNSPECIFIED', 'CURRENCY_UNKNOWN'].includes(m.budget as string) || !(m.distanceKm === null || (typeof m.distanceKm === 'number' && Number.isFinite(m.distanceKm) && m.distanceKm >= 0 && m.distanceKm <= 21000)) || !Array.isArray(m.reasons) || m.reasons.length < 1 || m.reasons.length > 10) throw new WishDataError();
    const reasons = m.reasons.map(v => { const r = object(v); if (typeof r.code !== 'string' || !codes.includes(r.code) || !text(r.text, 250)) throw new WishDataError(); return { code: r.code, text: r.text }; });
    const known = reasons.map(r => r.code);
    if (!known.includes('NAME') || new Set(known).size !== known.length || (m.budget === 'WITHIN') !== known.includes('BUDGET') || (m.budget === 'CURRENCY_UNKNOWN') !== known.includes('BUDGET_UNKNOWN') || (m.distanceKm !== null) !== known.includes('DISTANCE')) throw new WishDataError();
    return { wishItemId, listing, score: m.score, reasons, budget: m.budget as WishMatch['budget'], distanceKm: m.distanceKm as number | null };
  });
  if (new Set(items.map(m => m.listing.id)).size !== items.length) throw new WishDataError();
  return { items: items.filter(m => Date.parse(m.listing.expiresAt) > now), nextCursor: p.nextCursor as string | null, notice: p.notice, scannedCandidates: p.scannedCandidates as number };
}
