import { forbiddenListingField, LISTING_POLICY_VERSION } from '../lib/listingPolicy';

describe('shared pilot marketplace listing policy', () => {
    it.each(['槍枝', '槍支', '彈藥', '毒品', '大麻', '海洛因', '個人資料販售', '色情服務'])('preserves existing restricted phrase %s', title => {
        expect(forbiddenListingField({ title })).toBe('title');
    });
    it.each(['槍\u200b枝', '槍\u2060支', '彈\u202e藥', '毒\ufeff品', '個 人 資 料 販 售', 'ｆｉｒｅａｒｍ', 'AMMUNITION', 'he\u200broin', 'can\u0301nabis'])('rejects presentation-only obfuscation %s', title => {
        expect(forbiddenListingField({ title })).toBe('title');
    });
    it('checks restricted branding rather than trusting a safe title', () => {
        expect(forbiddenListingField({ title: '商品', brand: '槍\u200b械' })).toBe('brand');
    });
    it('checks descriptions even with an ordinary product title', () => {
        expect(forbiddenListingField({ title: '二手商品', description: '個人資料販售' })).toBe('description');
    });
    it.each(['Nintendo Switch OLED', '筋膜槍', '二手登山裝備', '書籍', '手作布偶'])('does not broaden a restriction to unrelated product %s', title => {
        expect(forbiddenListingField({ title, brand: '自有品牌' })).toBeNull();
    });
    it('has a public version without describing itself as complete moderation', () => {
        expect(LISTING_POLICY_VERSION).toBe('2026-09-15-pilot-v1');
        expect(forbiddenListingField({ title: '安全商品', description: null, brand: null })).toBeNull();
    });
});
