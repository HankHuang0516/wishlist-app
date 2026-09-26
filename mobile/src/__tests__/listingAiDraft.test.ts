import { describe, expect, it } from 'vitest';
import { confirmedBatchCandidates, mergeListingAiSuggestions, parseListingAiState, polledReviewStateAfterAi, restoreBatchCaptureOrder, reviewStateAfterAi, suggestedAskingPrice, suggestedBrand, type ListingAiDraft } from '../listingAiDraft';
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
  it('requires seller reconfirmation after every AI result, including a failed retry', () => {
    const original = { form: { ...emptyListingForm, title: '賣家確認的名稱', price: '999' }, touched: { title: true as const, price: true as const } };
    const confirmed = { ...original, published: false, confirmed: true };
    expect(confirmedBatchCandidates([confirmed])).toHaveLength(1);
    for (const state of [{ mediaId: id, status: 'PENDING' as const, draft: null },
      { mediaId: id, status: 'FAILED' as const, draft: null }, { mediaId: id, status: 'COMPLETED' as const, draft }]) {
      const updated = { ...confirmed, ...reviewStateAfterAi(confirmed, state) };
      expect(confirmedBatchCandidates([updated])).toHaveLength(0);
      expect(updated.form).toMatchObject({ title: '賣家確認的名稱', price: '999' });
    }
  });
  it('does not replace reviewed fields from a late AI poll during publication', () => {
    const confirmed = { form: { ...emptyListingForm, title: '賣家確認的檯燈', price: '350' },
      touched: {}, published: false, confirmed: true };
    const result = { mediaId: id, status: 'COMPLETED' as const, draft };
    expect(polledReviewStateAfterAi(confirmed, result, true)).toBeNull();
    expect(polledReviewStateAfterAi({ ...confirmed, published: true }, result, false)).toBeNull();
    expect(polledReviewStateAfterAi(confirmed, result, false)).toMatchObject({ confirmed: false,
      form: { title: draft.title, price: '1400' } });
  });
  it('keeps the latest private photos but restores their capture order', () => {
    const newestFirst = ['third photo', 'second photo', 'first photo', 'older photo'];
    expect(restoreBatchCaptureOrder(newestFirst, 3)).toEqual(['first photo', 'second photo', 'third photo']);
    expect(newestFirst).toEqual(['third photo', 'second photo', 'first photo', 'older photo']);
  });
});
