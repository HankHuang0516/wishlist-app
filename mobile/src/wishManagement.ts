import { uuid } from './listingForm';
export class WishManagementError extends Error { constructor(message = '願望資料不正確') { super(message); } }
export type ManagedList = { id: number; title: string; description: string | null; isPublic: boolean; maxItems: number; count: number };
export type ManagedWish = { id: number; wishlistId: number; name: string; notes: string | null; link: string | null; maxPrice: number | null; priceCurrency: string | null; isHidden: boolean; isPurchased: boolean };
const currencies = ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'CNY', 'HKD', 'KRW', 'SGD', 'AUD', 'CAD'];
export const validWishId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647;
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new WishManagementError(); return v as Record<string, unknown>; }
function text(v: unknown, max: number, empty = false): v is string { return typeof v === 'string' && (empty || !!v.trim()) && v.length <= max && !v.includes('\u0000'); }
function nullable(v: unknown, max: number): v is string | null { return v === null || text(v, max, true); }
export function parseManagedList(v: unknown): ManagedList {
  const p = record(v), count = record(p._count).items;
  if (!validWishId(p.id) || !text(p.title, 200) || !nullable(p.description, 1000) || typeof p.isPublic !== 'boolean' || typeof p.maxItems !== 'number' || !Number.isInteger(p.maxItems) || p.maxItems < 1 || p.maxItems > 10000 || typeof count !== 'number' || !Number.isInteger(count) || count < 0) throw new WishManagementError();
  return { id: p.id, title: p.title, description: p.description, isPublic: p.isPublic, maxItems: p.maxItems, count };
}
export function parseManagedWish(v: unknown): ManagedWish {
  const p = record(v);
  if (!validWishId(p.id) || !validWishId(p.wishlistId) || !text(p.name, 200) || !nullable(p.notes, 1000) || !nullable(p.link, 2048) || !(p.maxPrice === null || typeof p.maxPrice === 'number' && Number.isFinite(p.maxPrice) && p.maxPrice >= 0 && p.maxPrice <= 1e12) || !(p.priceCurrency === null || typeof p.priceCurrency === 'string' && currencies.includes(p.priceCurrency)) || typeof p.isHidden !== 'boolean' || typeof p.isPurchased !== 'boolean') throw new WishManagementError();
  return { id: p.id, wishlistId: p.wishlistId, name: p.name, notes: p.notes, link: p.link, maxPrice: p.maxPrice, priceCurrency: p.priceCurrency, isHidden: p.isHidden, isPurchased: p.isPurchased };
}
export function parseManagementPage<T extends { id: number }>(v: unknown, parse: (v: unknown) => T, limit: number) {
  const p = record(v); if (!Array.isArray(p.items) || p.items.length > limit || !(p.nextCursor === null || validWishId(p.nextCursor))) throw new WishManagementError();
  const items = p.items.map(parse);
  if (new Set(items.map(v => v.id)).size !== items.length || (p.nextCursor !== null && p.nextCursor !== items.at(-1)?.id)) throw new WishManagementError();
  return { items, nextCursor: p.nextCursor as number | null };
}
export type WishDraft = { name: string; notes: string; link: string; budget: string; currency: string };
export function wishDraftBody(form: WishDraft) {
  if (!text(form.name, 200) || /[\u0000-\u001f\u007f]/.test(form.name) || !text(form.notes, 1000, true)) throw new WishManagementError('請填寫200字內名稱與1000字內備註');
  let link: string | null = null;
  if (form.link.trim()) {
    let url: URL; try { url = new URL(form.link.trim()); } catch { throw new WishManagementError('請填寫有效的商品連結'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw new WishManagementError('連結只能使用無帳密的http(s)網址'); link = url.href;
  }
  const budget = form.budget.trim(); let maxPrice: number | null = null;
  if (budget) { if (!/^\d+(?:\.\d{1,2})?$/.test(budget) || !Number.isFinite(Number(budget)) || Number(budget) > 1e12) throw new WishManagementError('預算須為非負金額，最多兩位小數'); maxPrice = Number(budget); }
  const currency = form.currency.trim().toUpperCase(); if (maxPrice !== null && !currencies.includes(currency)) throw new WishManagementError('請填寫支援的幣別，例如TWD／USD／JPY');
  return { name: form.name.trim(), notes: form.notes || null, link, maxPrice, ...(maxPrice !== null ? { priceCurrency: currency } : {}) };
}
export type WishCreateJournal = { kind: 'LIST' | 'ITEM'; listId: number | null; body: string };
export function parseWishJournal(raw: string): WishCreateJournal {
  try {
    const p = record(JSON.parse(raw)); if (!['LIST', 'ITEM'].includes(p.kind as string) || typeof p.body !== 'string' || p.body.length > 6000 || !(p.kind === 'LIST' ? p.listId === null : validWishId(p.listId))) throw new WishManagementError();
    const body = record(JSON.parse(p.body)); if (!uuid(body.clientRequestId)) throw new WishManagementError();
    const allowed = p.kind === 'LIST' ? ['clientRequestId', 'title', 'description', 'isPublic'] : ['clientRequestId', 'name', 'notes', 'link', 'maxPrice', 'priceCurrency'];
    if (Object.keys(body).some(k => !allowed.includes(k)) || !(p.kind === 'LIST' ? text(body.title, 200) : text(body.name, 200))) throw new WishManagementError();
    return { kind: p.kind as WishCreateJournal['kind'], listId: p.listId as number | null, body: p.body };
  } catch { throw new WishManagementError('無法安全恢復上次建立；不會丟棄識別碼重新建立'); }
}
