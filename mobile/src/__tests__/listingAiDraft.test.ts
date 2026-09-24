import { describe, expect, it } from 'vitest';
import { confirmedBatchCandidates, mergeListingAiSuggestions, parseListingAiState, suggestedAskingPrice, suggestedBrand, type ListingAiDraft } from '../listingAiDraft';
import { emptyListingForm } from '../listingForm';

const id = '41fe5714-b31f-475d-b040-01e2a5c2e1cb';
const draft = { title: '黑色小型相機', description: '可見黑色機身、鏡頭與背面螢幕；功能仍須賣家確認。', category: 'electronics',
  brand: null, condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
  priceBasis: '僅依照片外觀粗估；未查詢即時成交價', evidence: ['可見鏡頭', '可見螢幕'], uncertainties: ['功能未驗證'],
  confidence: 0.86, source: 'MINIMAX_CODE_VISION' } satisfies ListingAiDraft;
describe('private listing AI draft protocol', () => {
  it('accepts a grounded draft and shows the range separately from a seller price', () => {
    const result = parseListingAiState({ mediaId: id, status: 'COMPLETED', draft }, id);
    expect(result.draft).toMatchObject({ title: draft.title, estimatedPriceLowTwd: 800 });
    expect(suggestedAskingPrice(result.draft!)).toBe('1400');
  });
  it('keeps uncertain prices empty and rejects mismatched media', () => {
    const noPrice = { ...draft, estimatedPriceLowTwd: null, estimatedPriceHighTwd: null, priceBasis: null };
    const result = parseListingAiState({ mediaId: id, status: 'COMPLETED', draft: noPrice }, id);
    expect(suggestedAskingPrice(result.draft!)).toBe('');
    expect(suggestedBrand(result.draft!)).toBe('');
    expect(() => parseListingAiState({ mediaId: 'another', status: 'COMPLETED', draft }, id)).toThrow();
  });
  it('never accepts a pending result containing a public-looking draft', () => {
    expect(() => parseListingAiState({ mediaId: id, status: 'PENDING', draft }, id)).toThrow();
  });
  it('fills only untouched fields when AI completes after seller edits', () => {
    const form = { ...emptyListingForm, title: '我自己命名', price: '999', brand: '未確認也不填' };
    const merged = mergeListingAiSuggestions(form, draft, { title: true, price: true, brand: true });
    expect(merged).toMatchObject({ title: '我自己命名', price: '999', brand: '未確認也不填',
      description: draft.description, category: 'electronics', condition: 'USED' });
    expect(mergeListingAiSuggestions(merged, draft, {})).toMatchObject({ title: draft.title, price: '1400', brand: '' });
  });
  it('selects only individually confirmed unpublished items for batch publication', () => {
    expect(confirmedBatchCandidates([
      { id: 'a', published: false, confirmed: true },
      { id: 'b', published: false, confirmed: false },
      { id: 'c', published: true, confirmed: true },
    ]).map(card => card.id)).toEqual(['a']);
  });
});
