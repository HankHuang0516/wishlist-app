import { describe, expect, it, vi } from 'vitest';
import { emptyListingForm } from '../listingForm';
import { parseSellerDraft, restoreSellerForm, sellerDraftFromCard, SellerDraftSync } from '../listingSellerDraft';

const id = 'cf8a3b08-7876-43b6-9a48-9872f0982270';
const mediaId = '5bb5ef08-18c9-4f23-b923-bd33809a247b';
const draft = sellerDraftFromCard({ clientListingId: id, form: { ...emptyListingForm,
  title: '藍色杯子', description: '杯口有缺角', price: '120', county: '臺北市', district: '大安區',
  latitude: '25.033', longitude: '121.56', consent: true }, touched: { title: true, price: true } });

describe('seller-edited batch draft recovery', () => {
  it('serializes only item edits and touched fields, never precise coordinates or consent', () => {
    expect(draft.form).toEqual({ title: '藍色杯子', description: '杯口有缺角', brand: '', category: 'other', condition: 'USED', price: '120' });
    expect(JSON.stringify(draft)).not.toMatch(/25\.033|121\.56|consent/);
    expect(parseSellerDraft(draft)).toEqual(draft);
    expect(() => parseSellerDraft({ ...draft, latitude: '25.033' })).toThrow();
  });
  it('keeps seller edits while applying AI fields that completed after the app was closed', () => {
    const ai = { title: '藍色陶瓷杯', description: '可見杯口缺角，杯身有藍色釉面。', category: 'home', brand: null,
      condition: 'USED' as const, estimatedPriceLowTwd: 50, estimatedPriceHighTwd: 150,
      priceBasis: '照片粗估', evidence: ['藍色釉面', '杯口缺角'], uncertainties: ['容量未確認'], confidence: 0.9,
      source: 'MINIMAX_CODE_VISION' as const };
    const saved = { ...draft, form: { ...draft.form, description: '', category: 'other', price: '120' },
      touched: { title: true, price: true } as const };
    const restored = restoreSellerForm(emptyListingForm, saved, ai);
    expect(restored).toMatchObject({ title: '藍色杯子', description: ai.description, category: 'home', price: '120' });
  });
  it('saves in order and flushes the newest edit before leaving', async () => {
    const calls: string[] = [];
    let releaseFirst: ((value: number) => void) | undefined;
    const sync = new SellerDraftSync(async (_media, version, value) => {
      calls.push(`${version}:${value.form.title}`);
      if (version === 0) return new Promise<number>(resolve => { releaseFirst = resolve; });
      return version + 1;
    }, () => { throw new Error('Unexpected save error'); }, 10000);
    sync.hydrate(mediaId, 0, null);
    sync.queue(mediaId, draft);
    const first = sync.flush(mediaId);
    sync.queue(mediaId, { ...draft, form: { ...draft.form, title: '藍色缺角杯子' } });
    const leaving = sync.flushAll();
    releaseFirst?.(1);
    expect(await first).toBe(true);
    expect(await leaving).toBe(true);
    expect(calls).toEqual(['0:藍色杯子', '1:藍色缺角杯子']);
    sync.dispose();
  });
  it('refuses a stale save acknowledgement and reports unsaved changes', async () => {
    const fail = vi.fn();
    const sync = new SellerDraftSync(async () => 9, fail, 10000);
    sync.hydrate(mediaId, 0, null);
    sync.queue(mediaId, draft);
    expect(await sync.flushAll()).toBe(false);
    expect(fail).toHaveBeenCalledTimes(1);
    sync.dispose();
  });
});
