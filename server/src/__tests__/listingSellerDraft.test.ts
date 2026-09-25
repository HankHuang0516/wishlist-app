import { parseListingSellerDraft } from '../lib/listingSellerDraft';

const good = { clientListingId: 'cf8a3b08-7876-43b6-9a48-9872f0982270', form: {
    title: '藍色杯子', description: '可見杯口有缺角；實際尺寸待確認。', brand: '', category: 'home', condition: 'USED', price: '120' },
    touched: { title: true, price: true } };

describe('private seller-edited batch draft', () => {
    it('preserves partial private edits and rejects precise location or credentials', () => {
        expect(parseListingSellerDraft(good)).toEqual(good);
        expect(() => parseListingSellerDraft({ ...good, latitude: '25.033' })).toThrow();
        expect(() => parseListingSellerDraft({ ...good, form: { ...good.form, longitude: '121.5' } })).toThrow();
        expect(() => parseListingSellerDraft({ ...good, form: { ...good.form, token: 'secret' } })).toThrow();
        expect(() => parseListingSellerDraft({ ...good, touched: { title: false } })).toThrow();
    });
    it('allows an unfinished form but bounds every field', () => {
        expect(parseListingSellerDraft({ ...good, form: { ...good.form, title: '', price: '' }, touched: {} })).not.toBeNull();
        expect(() => parseListingSellerDraft({ ...good, form: { ...good.form, description: 'x'.repeat(3001) } })).toThrow();
        expect(() => parseListingSellerDraft({ ...good, form: { ...good.form, price: '99999999999' } })).toThrow();
    });
});
