import { validListingAiDraft } from '../lib/listingAiDraft';

const sample = { recognizable: true, name: '黑色小型相機', description: '可見黑色機身、鏡頭與背面螢幕；功能與型號仍需賣家確認。',
    category: 'electronics', brand: null, condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
    priceBasis: '僅依圖片外觀粗估，未查詢即時成交價格', evidence: ['可見鏡頭', '可見螢幕'], uncertainties: ['功能未驗證'], confidence: 0.86 };

describe('seller-owned photo AI draft validation', () => {
    it('keeps a bounded suggestion and a clearly estimated price range', () => {
        expect(validListingAiDraft(sample)).toMatchObject({ title: sample.name, category: 'electronics', brand: null,
            condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000, source: 'MINIMAX_CODE_VISION' });
    });
    it('does not turn missing or implausible prices into sale prices', () => {
        expect(validListingAiDraft({ ...sample, estimatedPriceLowTwd: null, estimatedPriceHighTwd: 9999 })).toMatchObject({ estimatedPriceLowTwd: null, estimatedPriceHighTwd: null });
        expect(validListingAiDraft({ ...sample, estimatedPriceLowTwd: 1, estimatedPriceHighTwd: 9999 })).toMatchObject({ estimatedPriceLowTwd: null, estimatedPriceHighTwd: null });
    });
    it('rejects unrecognizable or unsupported descriptions', () => {
        expect(validListingAiDraft({ ...sample, recognizable: false })).toBeNull();
        expect(validListingAiDraft({ ...sample, evidence: [] })).toBeNull();
        expect(validListingAiDraft({ ...sample, confidence: 0.2 })).toBeNull();
    });
});
