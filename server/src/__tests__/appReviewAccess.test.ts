import { appReviewDemoUserId } from '../lib/appReviewAccess';
import { marketingEnabledFor } from '../lib/marketingAssistantAccess';
import { listingAiEnabledFor, listingAiUserIds } from '../lib/minimaxWorkerAuth';

describe('App Review free pilot access', () => {
    const original = { ...process.env };
    beforeEach(() => {
        process.env.APP_REVIEW_DEMO_USER_ID = '946';
        process.env.MARKETING_ASSISTANT_ENABLED = '1';
        process.env.MARKETING_ASSISTANT_PILOT_USER_ID = '928';
        process.env.MINIMAX_LISTING_AI_ENABLED = '1';
        process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = '928';
        process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = 'test-only-token-with-at-least-32-characters';
    });
    afterEach(() => { process.env = { ...original }; });

    it('allows the existing pilot and exact demo identity through both HTTP admission and worker selection', () => {
        expect(listingAiUserIds()).toEqual([928, 946]);
        for (const id of [928, 946]) {
            expect(marketingEnabledFor(id)).toBe(true);
            expect(listingAiEnabledFor(id)).toBe(true);
        }
        for (const id of [947, 948, 0, -1, 946.5]) {
            expect(marketingEnabledFor(id)).toBe(false);
            expect(listingAiEnabledFor(id)).toBe(false);
        }
    });
    it.each(['', '0946', '946 ', '946x', '9.46e2', '-946', '2147483648'])('rejects malformed or out of range review configuration: %s', raw => {
        process.env.APP_REVIEW_DEMO_USER_ID = raw;
        expect(appReviewDemoUserId()).toBeNull();
        expect(listingAiUserIds()).toEqual([928]);
        expect(marketingEnabledFor(946)).toBe(false);
    });
    it('preserves feature kill switches and worker authentication requirements', () => {
        delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
        expect(marketingEnabledFor(946)).toBe(false);
        expect(listingAiEnabledFor(946)).toBe(false);
        process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = 'test-only-token-with-at-least-32-characters';
        process.env.MARKETING_ASSISTANT_ENABLED = '0';
        process.env.MINIMAX_LISTING_AI_ENABLED = '0';
        expect(marketingEnabledFor(946)).toBe(false);
        expect(listingAiEnabledFor(946)).toBe(false);
    });
    it('does not let a demo identity override an invalid pilot configuration', () => {
        process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = 'oops';
        process.env.MARKETING_ASSISTANT_PILOT_USER_ID = 'oops';
        expect(listingAiUserIds()).toEqual([]);
        expect(listingAiEnabledFor(946)).toBe(false);
        expect(marketingEnabledFor(946)).toBe(false);
    });
});
