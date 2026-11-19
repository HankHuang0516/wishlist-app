import { describe, expect, it } from 'vitest';
import { listingShareMessage, listingShareUrl, productShareMessage, productShareUrl } from '../listingShare';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('published listing share URLs', () => {
  it('uses the public site origin and stable listing ID', () => {
    expect(listingShareUrl({ id, publishedAt: '2026-09-25T00:00:00.000Z', version: 3 },
      'https://wishlist-app-production.up.railway.app/api'))
      .toBe(`https://wishlist-app-production.up.railway.app/listings/${id}?v=3`);
  });
  it('does not expose drafts and rejects unsafe or malformed origins', () => {
    expect(listingShareUrl({ id, publishedAt: null, version: 3 }, 'https://wishlist-app-production.up.railway.app')).toBeNull();
    expect(listingShareUrl({ id: '../private', publishedAt: '2026-09-25T00:00:00Z', version: 3 }, 'https://example.com')).toBeNull();
    expect(listingShareUrl({ id, publishedAt: '2026-09-25T00:00:00Z', version: 0 }, 'https://example.com')).toBeNull();
    expect(() => listingShareUrl({ id, publishedAt: '2026-09-25T00:00:00Z', version: 3 }, 'http://evil.test')).toThrow();
  });
  it('puts the item name and price directly in the shared message', () => {
    const url = `https://wishlist-app-production.up.railway.app/listings/${id}?v=3`;
    expect(listingShareMessage({ title: '來自北極的禮物', price: 275 }, url)).toBe(`看看「來自北極的禮物」｜NT$ 275\n${url}`);
    expect(listingShareMessage({ title: '書', price: 0 }, url)).toContain('免費贈送');
    expect(listingShareMessage({ title: '書', price: null }, url)).toContain('價格洽詢');
  });
  it('gives every kind of product the address of its own public page', () => {
    const site = 'https://wishlist-app-production.up.railway.app';
    expect(productShareUrl({ kind: 'listing', id }, site + '/api')).toBe(`${site}/listings/${id}`);
    expect(productShareUrl({ kind: 'listing', id }, site, false, 4)).toBe(`${site}/listings/${id}?v=4`);
    expect(productShareUrl({ kind: 'source', id }, site)).toBe(`${site}/products/source/${id}`);
    expect(productShareUrl({ kind: 'external', id }, site)).toBe(`${site}/products/external/${id}`);
    expect(productShareUrl({ kind: 'source', id: '../private' }, site)).toBeNull();
    expect(productShareUrl({ kind: 'other' as 'source', id }, site)).toBeNull();
    expect(() => productShareUrl({ kind: 'source', id }, 'http://evil.test')).toThrow();
  });
  it('shares any product as one line of text and its address on the next', () => {
    const url = `https://wishlist-app-production.up.railway.app/products/source/${id}`;
    expect(productShareMessage('二手 BenQ 螢幕', 'NT$ 2,500', url)).toBe(`看看「二手 BenQ 螢幕」｜NT$ 2,500\n${url}`);
  });
});
