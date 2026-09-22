import { authorizeWishItemPatch, parseWishItemPatch, WishItemUpdateError } from '../lib/wishItemUpdate';

describe('wish item updates: strict fields and private ownership', () => {
    it.each([null, [], {}, { name: '' }, { name: '   ' }, { name: 1 }, { name: 'a'.repeat(201) }, { name: '\u0000' }, { isPurchased: 'false' }, { isHidden: 0 }, { maxPrice: -1 }, { maxPrice: Infinity }, { maxPrice: '  ' }, { maxPrice: true }, { maxPrice: 1e13 }, { notes: {} }, { notes: 'n'.repeat(1001) }, { link: 'javascript:alert(1)' }, { link: 'https://user:pass@example.com' }, { priceCurrency: 'XYZ' }, { priceCurrency: null }, { wishlistId: 99 }, { purchasedById: 1 }])('rejects malformed or owner-injected fields %#', raw => {
        expect(() => parseWishItemPatch(raw)).toThrow(WishItemUpdateError);
    });
    it('keeps an explicit zero, permits clearing notes/link/price/budget, and keeps the two currency concepts separate', () => {
        expect(parseWishItemPatch({ name: ' Sony 相機 ', price: 0, currency: 'usd', maxPrice: 0, priceCurrency: 'twd', isHidden: false, notes: '', link: null })).toEqual({ name: 'Sony 相機', price: '0', currency: 'USD', maxPrice: 0, priceCurrency: 'TWD', isHidden: false, notes: '', link: null });
        expect(parseWishItemPatch({ price: null, maxPrice: null, notes: null, link: '' })).toEqual({ price: null, maxPrice: null, notes: null, link: null });
    });
    const item = { ownerId: 1, isPublic: false, isHidden: false, isPurchased: false, purchasedById: null };
    it('lets the owner edit private and hidden wishes', () => {
        expect(() => authorizeWishItemPatch({ name: 'Edited', isPurchased: true }, 1, { ...item, isHidden: true })).not.toThrow();
    });
    it.each([{ isPublic: false, isHidden: false }, { isPublic: true, isHidden: true }])('refuses private or hidden gift claims %#', flags => {
        expect(() => authorizeWishItemPatch({ isPurchased: true }, 2, { ...item, ...flags })).toThrow(WishItemUpdateError);
    });
    it.each([{ name: '' }, { notes: '' }, { price: null }, { maxPrice: 0 }, { isHidden: false }])('refuses non-owner edits even with falsy values %#', patch => {
        expect(() => authorizeWishItemPatch({ ...patch, isPurchased: true }, 2, { ...item, isPublic: true })).toThrow(WishItemUpdateError);
    });
    it('permits public fulfillment and a fulfiller undo, not hijacking or undoing another claim', () => {
        expect(() => authorizeWishItemPatch({ isPurchased: true }, 2, { ...item, isPublic: true })).not.toThrow();
        expect(() => authorizeWishItemPatch({ isPurchased: false }, 2, { ...item, isPublic: true, isPurchased: true, purchasedById: 2 })).not.toThrow();
        for (const purchasedById of [null, 3]) for (const isPurchased of [true, false]) {
            try { authorizeWishItemPatch({ isPurchased }, 2, { ...item, isPublic: true, isPurchased: true, purchasedById }); throw new Error('Expected denial'); }
            catch (failure) { expect(failure).toBeInstanceOf(WishItemUpdateError); expect((failure as WishItemUpdateError).status).toBe(409); }
        }
    });
});
