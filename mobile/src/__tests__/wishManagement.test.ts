import { describe, it, expect } from 'vitest';
import { parseManagedList, parseManagedWish, parseManagementPage, parseWishJournal, wishDraftBody, validWishId } from '../wishManagement';
const list = { id: 1, title: 'Camera', description: null, isPublic: false, maxItems: 100, _count: { items: 1 } };
const wish = { id: 4, wishlistId: 1, name: 'Sony', notes: null, link: null, imageUrl: null, aiStatus: 'SKIPPED', price: null, currency: 'USD', aiLink: null, maxPrice: null, priceCurrency: null, isHidden: false, isPurchased: false } as const;
const form = { name: ' Sony ', notes: '', link: '', imageUrl: '', budget: '', currency: 'TWD' };
const clientRequestId = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('native wish management boundaries', () => {
  it('keeps minimal own management DTOs and strips unrelated fields', () => { expect(parseManagedList({ ...list, apiKey: 'synthetic-only' })).toEqual({ id: 1, title: 'Camera', description: null, isPublic: false, maxItems: 100, count: 1 }); expect(parseManagedWish({ ...wish, proxy_end_user_id: 'synthetic-only' })).toEqual({ id: 4, wishlistId: 1, name: 'Sony', notes: null, link: null, imageUrl: null, aiStatus: 'SKIPPED', aiPrice: null, aiCurrency: 'USD', aiLink: null, maxPrice: null, priceCurrency: null, isHidden: false, isPurchased: false }); });
  it.each([null, [], { ...list, id: 0 }, { ...list, title: '' }, { ...list, description: 1 }, { ...list, isPublic: 'true' }, { ...list, maxItems: 0 }, { ...list, maxItems: 10001 }, { ...list, _count: { items: -1 } }])('rejects invalid list DTO %j', input => { expect(() => parseManagedList(input)).toThrow(); });
  it.each([{ ...wish, wishlistId: 0 }, { ...wish, name: '' }, { ...wish, maxPrice: -1 }, { ...wish, maxPrice: Infinity }, { ...wish, priceCurrency: 'BAD' }, { ...wish, notes: [] }, { ...wish, link: 1 }, { ...wish, isHidden: 'true' }, { ...wish, isPurchased: 1 }])('rejects invalid wish DTO %j', input => { expect(() => parseManagedWish(input)).toThrow(); });
  it('accepts bounded prices and nullable or visible notes', () => { expect(parseManagedWish({ ...wish, maxPrice: 0, priceCurrency: 'TWD', notes: 'public notes', link: '' })).toMatchObject({ maxPrice: 0, notes: 'public notes' }); });
  it('checks page bounds, duplicate IDs and truthful cursors', () => {
    expect(parseManagementPage({ items: [wish], nextCursor: 4 }, parseManagedWish, 50).nextCursor).toBe(4);
    expect(parseManagementPage({ items: [], nextCursor: null }, parseManagedWish, 50).items).toEqual([]);
    for (const input of [{ items: [wish, wish], nextCursor: null }, { items: [wish], nextCursor: 5 }, { items: [], nextCursor: 1 }, { items: [], nextCursor: '1' }, { items: {} }]) expect(() => parseManagementPage(input, parseManagedWish, 50)).toThrow();
    expect(() => parseManagementPage({ items: [wish], nextCursor: null }, parseManagedWish, 0)).toThrow();
  });
  it('distinguishes an omitted budget from a zero budget and normalizes currencies', () => { expect(wishDraftBody(form)).toEqual({ name: 'Sony', notes: null, link: null, imageUrl: null, maxPrice: null }); expect(wishDraftBody({ ...form, budget: '0', currency: 'usd', notes: 'notes' })).toMatchObject({ maxPrice: 0, priceCurrency: 'USD', notes: 'notes' }); });
  it('normalizes a reference URL without fetching it', () => { expect(wishDraftBody({ ...form, link: ' https://example.com/item ', budget: '12.34' })).toMatchObject({ link: 'https://example.com/item', maxPrice: 12.34, priceCurrency: 'TWD' }); });
  it.each(['-1', 'Infinity', '1e3', '1.234', '1000000000001', 'not-money'])('refuses invalid budget %s', budget => { expect(() => wishDraftBody({ ...form, budget })).toThrow(); });
  it.each(['not-a-url', 'javascript:alert(1)', 'file:///private/file', 'https://user:pass@example.com', 'https://example.com/' + 'a'.repeat(2048)])('refuses unsafe link %s', link => { expect(() => wishDraftBody({ ...form, link })).toThrow(); });
  it('accepts only public HTTPS image-like URLs for queued AI', () => { expect(wishDraftBody({ ...form, imageUrl: ' https://images.example.com/camera?id=1 ' })).toMatchObject({ imageUrl: 'https://images.example.com/camera?id=1' }); for (const imageUrl of ['http://images.example.com/camera.jpg', 'https://example.com/product', 'https://u:p@example.com/a.jpg']) expect(() => wishDraftBody({ ...form, imageUrl })).toThrow(); });
  it('creates a photo-first wish without typing a name and keeps the media identity in recovery', () => {
    const mediaId = 'fab22941-2df0-4ca4-90c2-70c504527243';
    const body = wishDraftBody({ ...form, name: '' }, mediaId);
    expect(body).toMatchObject({ name: '待辨識商品', imageUrl: null, mediaId });
    expect(parseWishJournal(JSON.stringify({ kind: 'ITEM', listId: 1, body: JSON.stringify({ clientRequestId, ...body }) }))).toMatchObject({ kind: 'ITEM', listId: 1 });
    expect(() => wishDraftBody({ ...form, imageUrl: 'https://images.example.com/a.jpg' }, mediaId)).toThrow();
    expect(() => wishDraftBody(form, 'bad-id')).toThrow();
  });
  it('refuses unsupported currencies and malformed text', () => { expect(() => wishDraftBody({ ...form, budget: '1', currency: 'BAD' })).toThrow(); expect(() => wishDraftBody({ ...form, name: 'bad\nname' })).toThrow(); expect(() => wishDraftBody({ ...form, name: '' })).toThrow(); expect(() => wishDraftBody({ ...form, notes: 'a'.repeat(1001) })).toThrow(); });
  it('restores the exact request body and target instead of synthesizing a new ID', () => { const body = JSON.stringify({ clientRequestId, name: 'Sony' }); const journal = { kind: 'ITEM', listId: 1, body }; expect(parseWishJournal(JSON.stringify(journal))).toEqual(journal); const createList = { kind: 'LIST', listId: null, body: JSON.stringify({ clientRequestId, title: 'Camera' }) }; expect(parseWishJournal(JSON.stringify(createList))).toEqual(createList); });
  it('refuses corrupt, unscoped, or injected pending requests', () => {
    const body = JSON.stringify({ clientRequestId, name: 'Sony' });
    for (const input of ['bad-json', JSON.stringify({ kind: 'ITEM', listId: null, body }), JSON.stringify({ kind: 'OTHER', listId: 1, body }), JSON.stringify({ kind: 'ITEM', listId: 1, body: '{}' }), JSON.stringify({ kind: 'ITEM', listId: 1, body: JSON.stringify({ clientRequestId, name: 'Sony', userId: 3 }) }), JSON.stringify({ kind: 'LIST', listId: 1, body })]) expect(() => parseWishJournal(input)).toThrow();
  });
  it('validates PostgreSQL IDs without accepting numeric strings or arrays', () => { expect(validWishId(2147483647)).toBe(true); for (const v of [0, -1, 1.2, 2147483648, '1', [1]]) expect(validWishId(v)).toBe(false); });
});
