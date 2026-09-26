import { approximateDistanceKm, evaluateWishMatch, normalizeWish, parseWishMatchQuery, wishKeywords } from '../lib/wishlistMatch';
const now = new Date('2026-09-15T00:00:00.000Z');
const wish = { id: 1, name: 'Sony 相機', maxPrice: 5000, priceCurrency: 'TWD' };
const listing = () => ({ title: 'Sony 相機 A7 二手', brand: 'Sony', category: 'electronics', condition: 'USED', price: 4000, currency: 'TWD', deliveryMethods: ['MEETUP'], status: 'ACTIVE', expiresAt: new Date('2026-10-01'), publishedAt: now, lastVerifiedAt: now, location: { publicLatitude: 25.05, publicLongitude: 121.51 } });
describe('explainable first-party wish matching', () => {
    it('normalizes NFKC and punctuation and supports bounded Chinese terms', () => { expect(normalizeWish('ＳＯＮＹ— 相機')).toBe('sony 相機'); expect(wishKeywords('任天堂遊戲機')).toEqual(expect.arrayContaining(['任天堂遊戲機', '任天', '遊戲'])); expect(wishKeywords('二手 新品 想要')).toEqual([]); expect(wishKeywords('超'.repeat(200))).toHaveLength(2); });
    it('requires a real name match and explains a genuine budget comparison', () => {
        const m = evaluateWishMatch(wish, listing(), {}, now); expect(m).toMatchObject({ budget: 'WITHIN', distanceKm: null }); expect(m?.reasons.map(r => r.code)).toEqual(['NAME', 'BUDGET', 'RECENTLY_VERIFIED', 'FRESH']); expect(evaluateWishMatch({ ...wish, name: '電冰箱' }, listing(), {}, now)).toBeNull();
    });
    it('requires explicit Latin/model keywords and a title match, not just a same-brand unrelated object', () => {
        expect(wishKeywords('Sony相機A7')).toEqual(expect.arrayContaining(['sony', '相機', 'a7']));
        expect(evaluateWishMatch(wish, { ...listing(), title: '冰箱', brand: 'Sony' }, {}, now)).toBeNull();
        expect(evaluateWishMatch(wish, { ...listing(), title: 'Sony 冰箱', brand: 'Sony' }, {}, now)).toBeNull();
        expect(evaluateWishMatch(wish, { ...listing(), title: 'Canon 相機', brand: 'Canon' }, {}, now)).toBeNull();
    });
    it('does not infer a budget from legacy price or convert a foreign currency', () => {
        expect(evaluateWishMatch({ ...wish, maxPrice: null }, listing(), {}, now)?.budget).toBe('UNSPECIFIED'); expect(evaluateWishMatch({ ...wish, priceCurrency: 'USD' }, listing(), {}, now)?.budget).toBe('CURRENCY_UNKNOWN');
        expect(evaluateWishMatch(wish, { ...listing(), price: 5001 }, {}, now)).toBeNull(); expect(evaluateWishMatch(wish, { ...listing(), price: 5000 }, {}, now)?.budget).toBe('WITHIN');
    });
    it.each([{ brand: 'Canon' }, { category: 'books' }, { condition: 'NEW' as const }, { delivery: 'SHIPPING' as const }])('enforces explicit preferences %p', prefs => expect(evaluateWishMatch(wish, listing(), prefs, now)).toBeNull());
    it('scores only known matched preferences without pretending to verify product authenticity', () => {
        const m = evaluateWishMatch(wish, listing(), { brand: 'ＳＯＮＹ', category: 'electronics', condition: 'USED', delivery: 'MEETUP' }, now); expect(m?.reasons.map(r => r.code)).toEqual(expect.arrayContaining(['BRAND', 'CATEGORY', 'CONDITION', 'DELIVERY'])); expect(m?.score).toBeLessThanOrEqual(100);
        const old = new Date('2020-01-01'); expect(evaluateWishMatch(wish, { ...listing(), publishedAt: old, lastVerifiedAt: old }, {}, now)?.reasons.map(r => r.code)).toEqual(['NAME', 'BUDGET']);
    });
    it('uses coarse distance, enforces the unrounded radius and never discloses exact meetup coordinates', () => {
        const m = evaluateWishMatch(wish, listing(), { center: [25.05, 121.51], radiusKm: 1 }, now); expect(m?.distanceKm).toBe(0); expect(evaluateWishMatch(wish, listing(), { center: [22.63, 120.31], radiusKm: 1 }, now)).toBeNull(); expect(evaluateWishMatch(wish, { ...listing(), location: null }, { center: [25.05, 121.51] }, now)).toBeNull();
        expect(approximateDistanceKm([25.05, 121.51], [25.05, 121.51])).toBe(0); expect(approximateDistanceKm([0, 0], [0, 180])).toBeCloseTo(Math.PI * 6371);
    });
    it.each([{ status: 'DRAFT' }, { status: 'SOLD' }, { status: 'EXPIRED' }, { status: 'REMOVED' }, { expiresAt: now }, { expiresAt: null }, { price: null }, { price: NaN }, { price: -1 }])('rejects unavailable or invalid listings %p', overrides => expect(evaluateWishMatch(wish, { ...listing(), ...overrides }, {}, now)).toBeNull());
    it('accepts reserved listings but does not score future freshness timestamps or invalid clocks', () => { expect(evaluateWishMatch(wish, { ...listing(), status: 'RESERVED' }, {}, now)).not.toBeNull(); expect(evaluateWishMatch(wish, listing(), {}, new Date(NaN))).toBeNull(); expect(evaluateWishMatch(wish, { ...listing(), lastVerifiedAt: new Date('2027-01-01'), publishedAt: null }, {}, now)?.reasons.map(r => r.code)).toEqual(['NAME', 'BUDGET']); });
    it('accepts bounded preferences with approximate-only coordinates', () => { expect(parseWishMatchQuery({ wishItemId: '1', center: '25.05,121.51', radiusKm: '10', condition: 'USED', limit: '2' })).toMatchObject({ id: 1, search: { limit: 2 }, preferences: { center: [25.05, 121.51], radiusKm: 10 } }); });
    it('requires an explicit safe opt-in to preview own listing matches', () => {
        expect(parseWishMatchQuery({ wishItemId: '1' }).includeOwnPreview).toBe(false);
        expect(parseWishMatchQuery({ wishItemId: '1', includeOwnPreview: '1' }).includeOwnPreview).toBe(true);
        for (const value of ['0', 'true', '1&ownerUserId=2']) expect(() => parseWishMatchQuery({ wishItemId: '1', includeOwnPreview: value })).toThrow();
    });
    it.each([{}, { wishItemId: '0' }, { wishItemId: '1.5' }, { wishItemId: '2147483648' }, { wishItemId: '1', ownerUserId: '2' }, { wishItemId: '1', center: '25.04735,121.51731' }, { wishItemId: '1', center: '25.04,121.52' }, { wishItemId: '1', center: '19.99,121.51' }, { wishItemId: '1', radiusKm: '10' }, { wishItemId: '1', center: '25.05,121.51', radiusKm: '201' }, { wishItemId: '1', center: '25.05,121.51', radiusKm: '0' }, { wishItemId: '1', center: '25.05,121.51', radiusKm: 'NaN' }])('rejects malformed queries or precise GPS %p', q => expect(() => parseWishMatchQuery(q)).toThrow());
});
