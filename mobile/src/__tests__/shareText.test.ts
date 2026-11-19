import { describe, expect, it } from 'vitest';
import { parseSharedWish, productShareLines, productSharePath, wishShareBudget, wishShareLines, wishSharePath, withShareUrl } from '../shareText';

const id = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('the text and address a share hands on, shared by the web page and the app', () => {
  it('names one page per product and refuses anything that is not a product', () => {
    expect(productSharePath('listing', id)).toBe('/listings/' + id);
    expect(productSharePath('listing', id, 7)).toBe(`/listings/${id}?v=7`);
    for (const version of [0, -1, 1.5, 2147483648, Number.NaN]) expect(productSharePath('listing', id, version)).toBe('/listings/' + id);
    expect(productSharePath('source', id)).toBe('/products/source/' + id);
    expect(productSharePath('external', id, 7)).toBe('/products/external/' + id);
    for (const bad of ['', 'not-a-product', id + '/../settings', id + '?next=//evil.example']) expect(productSharePath('source', bad)).toBeNull();
  });
  it('writes the product line in the reader’s language and puts the address on its own line', () => {
    expect(withShareUrl(productShareLines('來自北極的禮物', 'NT$ 275'), 'https://site.test/x')).toBe('看看「來自北極的禮物」｜NT$ 275\nhttps://site.test/x');
    expect(productShareLines('Desk lamp', 'NT$ 275', 'en')).toBe('Take a look: Desk lamp | NT$ 275');
  });
  it('accepts only the shared-wish path the server makes', () => {
    const path = '/shared-wishes/AbCdEfGhIjKlMnOpQrSt_-';
    expect(wishSharePath(path)).toBe(path); expect(wishSharePath({ path })).toBe(path);
    for (const bad of [null, undefined, 5, {}, { path: 5 }, '/shared-wishes/', path + 'x', path.slice(0, -1), path + '/more', '//evil.example' + path, path + '#x'])
      expect(wishSharePath(bad)).toBeNull();
  });
  it('says a wish’s name and budget and nothing else', () => {
    expect(wishShareBudget({ maxPrice: 1500, priceCurrency: 'TWD' })).toBe('TWD 1,500');
    expect(wishShareBudget({ maxPrice: 99.5, priceCurrency: null })).toBe('99.5');
    expect(wishShareBudget({ maxPrice: null, priceCurrency: 'TWD' })).toBe('');
    expect(wishShareLines({ name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD' })).toBe('我的願望是「橘色桌燈」\n我的預算：TWD 1,500\n如果你剛好看到，分享給我吧！\n— Wishlist.ai 願望市集');
    expect(wishShareLines({ name: 'Camera', maxPrice: null, priceCurrency: null }, 'en')).toBe('My wish: Camera\nIf you come across it, let me know!\n— Wishlist.ai');
  });
  it('reads a shared wish only in the exact shape the page shows', () => {
    expect(parseSharedWish({ name: '相機', maxPrice: null, priceCurrency: 'TWD' })).toEqual({ name: '相機', maxPrice: null, priceCurrency: null });
    expect(parseSharedWish({ name: '相機', maxPrice: 800, priceCurrency: 'TWD' })).toEqual({ name: '相機', maxPrice: 800, priceCurrency: 'TWD' });
    for (const bad of [null, [], {}, { name: '', maxPrice: null, priceCurrency: null }, { name: '相機', maxPrice: '800', priceCurrency: 'TWD' }, { name: '相機', maxPrice: -1, priceCurrency: 'TWD' },
      { name: '相機', maxPrice: null, priceCurrency: null, notes: 'PRIVATE' }, { name: '相機', maxPrice: null }])
      expect(() => parseSharedWish(bad)).toThrow();
  });
});
