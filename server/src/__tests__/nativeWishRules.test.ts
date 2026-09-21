import { nativeListCreate, nativeWishlistPatch, nativeWishCreate, wishCreateHash, wishId, wishRequestId } from '../lib/nativeWishRules';
const clientRequestId = 'b5abf861-a66d-4072-876b-4f0ab3172dac';
describe('native wish create / deterministic bounded input', () => {
    it('defaults lists to private and normalizes text', () => { expect(nativeListCreate({ clientRequestId, title: '  相機  ' })).toEqual({ clientRequestId, data: { title: '相機', description: null, isPublic: false } }); });
    it('retains explicit visibility and clearable description', () => { expect(nativeWishlistPatch({ isPublic: true, description: '' })).toEqual({ isPublic: true, description: '' }); expect(nativeWishlistPatch({ description: null, title: '新的' })).toEqual({ description: null, title: '新的' }); });
    it.each([{}, [], null, { title: '' }, { title: [] }, { title: 'x'.repeat(201) }, { title: 'bad\nname' }, { isPublic: 'true' }, { description: 1 }, { description: 'x'.repeat(1001) }, { description: '\u0000' }, { userId: 4 }])('rejects invalid list patch %j', input => { expect(() => nativeWishlistPatch(input)).toThrow(); });
    it('requires a name and separates absent and zero budgets', () => {
        expect(nativeWishCreate({ clientRequestId, name: 'Sony' }).data).toEqual({ name: 'Sony', notes: null, link: null, maxPrice: null, priceCurrency: null });
        expect(nativeWishCreate({ clientRequestId, name: 'Sony', maxPrice: 0 }).data).toMatchObject({ maxPrice: 0, priceCurrency: 'TWD' });
        expect(nativeWishCreate({ clientRequestId, name: 'Sony', maxPrice: 100, priceCurrency: 'usd' }).data).toMatchObject({ maxPrice: 100, priceCurrency: 'USD' });
    });
    it.each([{ clientRequestId }, { clientRequestId, name: 'a', priceCurrency: 'USD' }, { clientRequestId, name: 'a', maxPrice: null, priceCurrency: 'USD' }, { clientRequestId, name: 'a', purchasedById: 99 }, { clientRequestId, name: 'a', link: 'javascript:alert(1)' }])('refuses incomplete or injected create %j', input => { expect(() => nativeWishCreate(input)).toThrow(); });
    it('normalizes UUID case without accepting unbounded or fake operation IDs', () => { expect(wishRequestId(clientRequestId.toUpperCase())).toBe(clientRequestId); for (const input of ['', 'secret', null, 42, clientRequestId.replace('-4072-', '-1072-')]) expect(() => wishRequestId(input)).toThrow(); });
    it('requires title on list creation', () => { expect(() => nativeListCreate({ clientRequestId, description: 'notes' })).toThrow(); });
    it('accepts PostgreSQL positive IDs only', () => { expect(wishId('2147483647')).toBe(2147483647); expect(wishId(1)).toBe(1); for (const input of [0, -1, '1.2', '2147483648', ['1'], {}]) expect(() => wishId(input)).toThrow(); });
    it('hashes normalized create data, target and kind independently', () => { const a = nativeListCreate({ clientRequestId, title: 'Camera' }).data, b = nativeListCreate({ clientRequestId, title: ' Camera ' }).data; expect(wishCreateHash('LIST', null, a)).toBe(wishCreateHash('LIST', null, b)); expect(wishCreateHash('LIST', null, a)).not.toBe(wishCreateHash('ITEM', 1, a)); expect(wishCreateHash('ITEM', 1, a)).not.toBe(wishCreateHash('ITEM', 2, a)); });
});
