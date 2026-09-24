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
    });
    it.each([
        [{ ...item, canonicalUrl: 'https://partner.example.com.evil.test/items/123' }, 'canonicalUrl'],
        [{ ...item, canonicalUrl: 'http://partner.example.com/items/123' }, 'canonicalUrl'],
        [{ ...item, imageUrl: 'https://other.example.com/123.jpg' }, 'imageUrl'],
        [{ ...item, county: '臺中市' }, 'county'],
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
