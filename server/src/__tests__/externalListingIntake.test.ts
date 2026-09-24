import { ExternalIntakeError, parseExternalCandidate, parseExternalSource } from '../lib/externalListingIntake';

const now = new Date('2026-09-24T12:00:00Z');
const source = { canonicalHost: 'partner.example.com', imageHost: 'images.example.com', imageReuseAllowed: true, textReuseAllowed: true };
const item = { sourceItemId: 'taipei-123', canonicalUrl: 'https://partner.example.com/items/123', imageUrl: 'https://images.example.com/123.jpg',
    title: '二手桌上型檯燈', description: '外觀有輕微使用痕跡，功能正常。', priceTwd: 560, condition: 'USED',
    county: '台北市', district: '中山區', observedAt: '2026-09-24T11:00:00Z', expiresAt: '2026-10-01T11:00:00Z' };

describe('authorized external supply intake', () => {
    it('registers a bounded rights reference, never an active source by implication', () => {
        expect(parseExternalSource({ name: '北部合作商家', kind: 'PARTNER_FEED', canonicalHost: 'partner.example.com',
            imageHost: 'images.example.com', authorizationRef: 'contract:partner-2026-09', textReuseAllowed: true,
            imageReuseAllowed: true })).toMatchObject({ canonicalHost: 'partner.example.com', authorizationRef: 'contract:partner-2026-09' });
        expect(() => parseExternalSource({ name: '假來源', kind: 'PARTNER_FEED', canonicalHost: 'localhost',
            authorizationRef: 'contract:missing', textReuseAllowed: true, imageReuseAllowed: false })).toThrow(ExternalIntakeError);
        expect(() => parseExternalSource({ name: '未證明來源', kind: 'PARTNER_FEED', canonicalHost: 'partner.example.com',
            authorizationRef: 'raw-private-token-value', textReuseAllowed: true, imageReuseAllowed: false })).toThrow(ExternalIntakeError);
    });
    it('accepts only fresh sourced records and normalizes Taipei spelling', () => {
        expect(parseExternalCandidate(item, source, now)).toMatchObject({ county: '臺北市', priceTwd: 560, condition: 'USED',
            canonicalUrl: 'https://partner.example.com/items/123', contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
        expect(parseExternalCandidate({ ...item, county: '新北市', district: '板橋區' }, source, now))
            .toMatchObject({ county: '新北市', district: '板橋區' });
    });
    it('recognizes all 12 Taipei and 29 New Taipei official districts', () => {
        const districts = {
            '臺北市': '松山區 信義區 大安區 中山區 中正區 大同區 萬華區 文山區 南港區 內湖區 士林區 北投區'.split(' '),
            '新北市': '板橋區 三重區 中和區 永和區 新莊區 新店區 土城區 蘆洲區 汐止區 樹林區 鶯歌區 三峽區 淡水區 瑞芳區 五股區 泰山區 林口區 八里區 深坑區 石碇區 坪林區 三芝區 石門區 金山區 萬里區 平溪區 雙溪區 貢寮區 烏來區'.split(' '),
        };
        expect(districts['臺北市']).toHaveLength(12);
        expect(districts['新北市']).toHaveLength(29);
        for (const [county, names] of Object.entries(districts)) {
            for (const district of names) expect(parseExternalCandidate({ ...item, county, district }, source, now)).toMatchObject({ county, district });
        }
    });
    it.each([
        [{ ...item, canonicalUrl: 'https://partner.example.com.evil.test/items/123' }, 'canonicalUrl'],
        [{ ...item, canonicalUrl: 'http://partner.example.com/items/123' }, 'canonicalUrl'],
        [{ ...item, imageUrl: 'https://other.example.com/123.jpg' }, 'imageUrl'],
        [{ ...item, county: '臺中市' }, 'county'],
        [{ ...item, county: '台北市', district: '板橋區' }, 'district'],
        [{ ...item, county: '新北市', district: '中山區' }, 'district'],
        [{ ...item, district: '火星區' }, 'district'],
        [{ ...item, priceTwd: 0 }, 'priceTwd'],
        [{ ...item, observedAt: '2026-09-20T11:00:00Z' }, 'expiresAt'],
        [{ ...item, expiresAt: '2026-10-30T11:00:00Z' }, 'expiresAt'],
        [{ ...item, title: '二手桌上型檯燈，LINE ID: seller123' }, 'title'],
    ])('rejects unsupported or unsafe record %p', (raw, field) => {
        try { parseExternalCandidate(raw, source, now); throw new Error('accepted unsafe record'); }
        catch (error) { expect(error).toBeInstanceOf(ExternalIntakeError); expect((error as ExternalIntakeError).field).toBe(field); }
    });
    it('does not reuse images or description without explicit rights', () => {
        expect(() => parseExternalCandidate(item, { ...source, imageReuseAllowed: false }, now)).toThrow(ExternalIntakeError);
        expect(() => parseExternalCandidate({ ...item, imageUrl: null }, { ...source, textReuseAllowed: false }, now)).toThrow(ExternalIntakeError);
    });
});
