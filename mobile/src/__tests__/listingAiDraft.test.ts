import { describe, expect, it } from 'vitest';
import { parseListingAiState, suggestedAskingPrice } from '../listingAiDraft';

const id = '41fe5714-b31f-475d-b040-01e2a5c2e1cb';
const draft = { title: '黑色小型相機', description: '可見黑色機身、鏡頭與背面螢幕；功能仍須賣家確認。', category: 'electronics',
  brand: null, condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
  priceBasis: '僅依照片外觀粗估；未查詢即時成交價', evidence: ['可見鏡頭', '可見螢幕'], uncertainties: ['功能未驗證'],
  confidence: 0.86, source: 'MINIMAX_CODE_VISION' };
describe('private listing AI draft protocol', () => {
  it('accepts a grounded draft and shows the range separately from a seller price', () => {
    const result = parseListingAiState({ mediaId: id, status: 'COMPLETED', draft }, id);
    expect(result.draft).toMatchObject({ title: draft.title, estimatedPriceLowTwd: 800 });
    expect(suggestedAskingPrice(result.draft!)).toBe('1400');
  });
  it('keeps uncertain prices empty and rejects mismatched media', () => {
    const noPrice = { ...draft, estimatedPriceLowTwd: null, estimatedPriceHighTwd: null, priceBasis: null };
    expect(suggestedAskingPrice(parseListingAiState({ mediaId: id, status: 'COMPLETED', draft: noPrice }, id).draft!)).toBe('');
    expect(() => parseListingAiState({ mediaId: 'another', status: 'COMPLETED', draft }, id)).toThrow();
  });
  it('never accepts a pending result containing a public-looking draft', () => {
    expect(() => parseListingAiState({ mediaId: id, status: 'PENDING', draft }, id)).toThrow();
  });
});
