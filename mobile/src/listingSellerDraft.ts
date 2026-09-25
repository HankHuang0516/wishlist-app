import { CATEGORIES, type ListingForm, uuid } from './listingForm';
import { mergeListingAiSuggestions, type ListingAiDraft, type ListingAiTouched } from './listingAiDraft';

export type SellerDraft = { clientListingId: string; form: Pick<ListingForm, 'title' | 'description' | 'brand' | 'category' | 'condition' | 'price'>;
  touched: ListingAiTouched };
const fields = ['title', 'description', 'brand', 'category', 'condition', 'price'] as const;
const allowed = new Set<string>(fields);
export function sellerDraftFromCard(card: { clientListingId: string; form: ListingForm; touched: ListingAiTouched }): SellerDraft {
  return { clientListingId: card.clientListingId, form: Object.fromEntries(fields.map(field => [field, card.form[field]])) as SellerDraft['form'],
    touched: { ...card.touched } };
}
export function parseSellerDraft(value: unknown): SellerDraft | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PRIVATE_DRAFT_INVALID');
  const draft = value as Record<string, unknown>;
  if (Object.keys(draft).sort().join(',') !== 'clientListingId,form,touched' || !uuid(draft.clientListingId)) throw new Error('PRIVATE_DRAFT_INVALID');
  const form = draft.form as Record<string, unknown>;
  const touched = draft.touched as Record<string, unknown>;
  if (!form || typeof form !== 'object' || Array.isArray(form) || Object.keys(form).sort().join(',') !== 'brand,category,condition,description,price,title' ||
    !touched || typeof touched !== 'object' || Array.isArray(touched) ||
    Object.entries(touched).some(([key, flag]) => !allowed.has(key) || flag !== true) ||
    typeof form.title !== 'string' || form.title.length > 100 || typeof form.description !== 'string' || form.description.length > 3000 ||
    typeof form.brand !== 'string' || form.brand.length > 60 || typeof form.price !== 'string' || form.price.length > 13 ||
    (form.price !== '' && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) > 9_999_999_999.99)) ||
    !CATEGORIES.some(([key]) => key === form.category) || !['NEW', 'USED'].includes(String(form.condition))) throw new Error('PRIVATE_DRAFT_INVALID');
  return { clientListingId: draft.clientListingId as string, form: form as SellerDraft['form'], touched: touched as ListingAiTouched };
}
export function restoreSellerForm(base: ListingForm, saved: SellerDraft | null, ai: ListingAiDraft | null): ListingForm {
  if (!saved) return base;
  const form = { ...base, ...saved.form };
  return ai ? mergeListingAiSuggestions(form, ai, saved.touched) : form;
}

type Save = (mediaId: string, expectedVersion: number, draft: SellerDraft) => Promise<number>;
type Entry = { version: number; persisted: string | null; latest: string | null; timer: ReturnType<typeof setTimeout> | null; inFlight: Promise<boolean> | null };
export class SellerDraftSync {
  private entries = new Map<string, Entry>();
  constructor(private save: Save, private onError: (error: unknown) => void, private delayMs = 500) {}
  has(mediaId: string) { return this.entries.has(mediaId); }
  hydrate(mediaId: string, version: number, draft: SellerDraft | null) {
    if (!uuid(mediaId) || !Number.isSafeInteger(version) || version < 0 || this.entries.has(mediaId)) throw new Error('PRIVATE_DRAFT_INVALID');
    this.entries.set(mediaId, { version, persisted: draft ? JSON.stringify(draft) : null, latest: draft ? JSON.stringify(draft) : null,
      timer: null, inFlight: null });
  }
  queue(mediaId: string, draft: SellerDraft) {
    const entry = this.entries.get(mediaId);
    if (!entry) throw new Error('PRIVATE_DRAFT_NOT_READY');
    const latest = JSON.stringify(draft);
    if (entry.latest === latest) return;
    entry.latest = latest;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { entry.timer = null; void this.flush(mediaId); }, this.delayMs);
  }
  async flush(mediaId: string): Promise<boolean> {
    const entry = this.entries.get(mediaId);
    if (!entry) return true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (entry.inFlight) return entry.inFlight;
    const work = (async () => {
      while (entry.latest !== entry.persisted) {
        const current = entry.latest;
        if (!current) break;
        try {
          const next = await this.save(mediaId, entry.version, JSON.parse(current) as SellerDraft);
          if (!Number.isSafeInteger(next) || next !== entry.version + 1) throw new Error('PRIVATE_DRAFT_BAD_ACK');
          entry.version = next; entry.persisted = current;
        } catch (error) { if (this.entries.get(mediaId) === entry) this.onError(error); return false; }
      }
      return true;
    })();
    entry.inFlight = work;
    try { return await work; } finally { if (entry.inFlight === work) entry.inFlight = null; }
  }
  async flushAll() { return (await Promise.all([...this.entries.keys()].map(key => this.flush(key)))).every(Boolean); }
  discard(mediaId: string) { const entry = this.entries.get(mediaId); if (entry?.timer) clearTimeout(entry.timer); this.entries.delete(mediaId); }
  dispose() { for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer); this.entries.clear(); }
}
