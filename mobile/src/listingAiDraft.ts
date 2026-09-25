import { CATEGORIES, uuid, type ListingForm } from './listingForm';

export class ListingAiDraftError extends Error {}
export type ListingAiDraft = {
  title: string; description: string; category: string; brand: string | null; condition: 'NEW' | 'USED' | null;
  estimatedPriceLowTwd: number | null; estimatedPriceHighTwd: number | null; priceBasis: string | null;
  evidence: string[]; uncertainties: string[]; confidence: number; source: 'MINIMAX_CODE_VISION';
};
export type ListingAiState = { mediaId: string; status: 'SKIPPED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; draft: ListingAiDraft | null };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingAiDraftError('AI 草稿回應不正確');
  return value as Record<string, unknown>;
};
const words = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const strings = (value: unknown, maxItems: number, max: number): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every(v => words(v, max));
export function parseListingAiState(value: unknown, mediaId: string): ListingAiState {
  const row = object(value);
  if (!uuid(mediaId) || row.mediaId !== mediaId || !['SKIPPED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(row.status as string)) throw new ListingAiDraftError('AI 草稿回應不正確');
  if (row.status !== 'COMPLETED') {
    if (row.draft !== null) throw new ListingAiDraftError('AI 草稿狀態不正確');
    return { mediaId, status: row.status as ListingAiState['status'], draft: null };
  }
  const draft = object(row.draft);
  const low = draft.estimatedPriceLowTwd, high = draft.estimatedPriceHighTwd;
  const estimate = low === null && high === null && draft.priceBasis === null ||
    typeof low === 'number' && Number.isSafeInteger(low) && low >= 0 && low <= 1_000_000 &&
    typeof high === 'number' && Number.isSafeInteger(high) && high >= low && high <= 1_000_000 && words(draft.priceBasis, 240);
  if (!words(draft.title, 100) || !words(draft.description, 1500) || !CATEGORIES.some(c => c[0] === draft.category) ||
    !(draft.brand === null || words(draft.brand, 60)) || ![null, 'NEW', 'USED'].includes(draft.condition as string | null) ||
    !estimate || !strings(draft.evidence, 6, 160) || draft.evidence.length < 2 || !strings(draft.uncertainties, 6, 160) ||
    typeof draft.confidence !== 'number' || draft.confidence < 0.7 || draft.confidence > 1 || draft.source !== 'MINIMAX_CODE_VISION') throw new ListingAiDraftError('AI 草稿內容不正確');
  return { mediaId, status: 'COMPLETED', draft: draft as ListingAiDraft };
}

export function suggestedAskingPrice(draft: ListingAiDraft) {
  if (draft.estimatedPriceLowTwd === null || draft.estimatedPriceHighTwd === null) return '';
  return String(Math.round((draft.estimatedPriceLowTwd + draft.estimatedPriceHighTwd) / 2));
}

export const suggestedBrand = (draft: ListingAiDraft) => draft.brand ?? '';

export type ListingAiField = 'title' | 'description' | 'category' | 'brand' | 'condition' | 'price';
export type ListingAiTouched = Partial<Record<ListingAiField, true>>;

export function mergeListingAiSuggestions(form: ListingForm, draft: ListingAiDraft, touched: ListingAiTouched): ListingForm {
  return { ...form,
    title: touched.title ? form.title : draft.title,
    description: touched.description ? form.description : draft.description,
    category: touched.category ? form.category : draft.category,
    brand: touched.brand ? form.brand : suggestedBrand(draft),
    condition: touched.condition ? form.condition : draft.condition ?? 'USED',
    price: touched.price ? form.price : suggestedAskingPrice(draft),
  };
}

export function confirmedBatchCandidates<T extends { published: boolean; confirmed: boolean }>(cards: readonly T[]): T[] {
  return cards.filter(card => !card.published && card.confirmed);
}

// The private recovery endpoint returns the latest uploads first. Keep its
// newest-N safety cap, then restore the camera/gallery capture order in the UI.
export function restoreBatchCaptureOrder<T>(newestFirst: readonly T[], limit: number): T[] {
  return newestFirst.slice(0, limit).reverse();
}
