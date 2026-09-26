import {
    MARKETING_CREDIT_PACK_SIZE, MARKETING_FREE_MONTHLY_LIMIT, MARKETING_PREMIUM_PERIOD_LIMIT,
    freeMarketingWindow, premiumMarketingWindow, freeRevisionDeadline, mayRequestFreeRevision,
    selectedRevisionImages, marketingDeliveryComplete,
} from '../lib/marketingAssistantRules';

describe('Marketing Assistant Beta domain rules', () => {
    it('uses Asia/Taipei calendar boundaries for a free account, including year rollover', () => {
        expect(MARKETING_FREE_MONTHLY_LIMIT).toBe(3);
        expect(MARKETING_CREDIT_PACK_SIZE).toBe(10);
        expect(freeMarketingWindow(new Date('2026-09-30T15:59:59.999Z'))).toEqual({
            startsAt: new Date('2026-08-31T16:00:00.000Z'), endsAt: new Date('2026-09-30T16:00:00.000Z'), limit: 3,
        });
        expect(freeMarketingWindow(new Date('2026-12-31T16:00:00.000Z'))).toEqual({
            startsAt: new Date('2026-12-31T16:00:00.000Z'), endsAt: new Date('2027-01-31T16:00:00.000Z'), limit: 3,
        });
        expect(() => freeMarketingWindow(new Date('invalid'))).toThrow();
    });

    it('follows a verified membership billing period instead of inventing a 30-day month', () => {
        const start = new Date('2026-01-31T12:00:00.000Z'), end = new Date('2026-02-28T12:00:00.000Z');
        expect(MARKETING_PREMIUM_PERIOD_LIMIT).toBe(100);
        expect(premiumMarketingWindow(start, start, end)).toEqual({ startsAt: start, endsAt: end, limit: 100 });
        expect(premiumMarketingWindow(new Date(end.getTime() - 1), start, end)?.limit).toBe(100);
        expect(premiumMarketingWindow(end, start, end)).toBeNull();
        expect(() => premiumMarketingWindow(start, end, start)).toThrow();
    });

    it('allows one selected-image revision within exactly seven days of completion', () => {
        const completed = new Date('2026-09-24T09:00:00.000Z');
        const expires = new Date('2026-10-01T09:00:00.000Z');
        expect(freeRevisionDeadline(completed)).toEqual(expires);
        expect(mayRequestFreeRevision(completed, new Date(expires.getTime() - 1), false)).toBe(true);
        expect(mayRequestFreeRevision(completed, expires, false)).toBe(false);
        expect(mayRequestFreeRevision(completed, completed, true)).toBe(false);
        expect(mayRequestFreeRevision(completed, new Date(completed.getTime() - 1), false)).toBe(false);
        expect(selectedRevisionImages(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(['b', 'd']);
        expect(() => selectedRevisionImages(['a', 'b', 'c', 'd'], [])).toThrow();
        expect(() => selectedRevisionImages(['a', 'b', 'c', 'd'], ['e'])).toThrow();
        expect(() => selectedRevisionImages(['a', 'b', 'c', 'd'], ['a', 'a'])).toThrow();
    });

    it('does not settle a partial, duplicate, or copyless output as a paid usage', () => {
        expect(marketingDeliveryComplete(['a', 'b', 'c', 'd'], ' 商品說明 ')).toBe(true);
        expect(marketingDeliveryComplete(['a', 'b', 'c'], '說明')).toBe(false);
        expect(marketingDeliveryComplete(['a', 'b', 'c', 'c'], '說明')).toBe(false);
        expect(marketingDeliveryComplete(['a', 'b', 'c', 'd'], '  ')).toBe(false);
    });
});
