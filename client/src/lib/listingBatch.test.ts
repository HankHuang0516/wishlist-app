import { describe, expect, it, vi } from 'vitest';
import { buildPublishedListing, emptyListingDraft, mergeAiDraft, parseAiState, prepareListingUploadFile } from './listingBatch';
import type { AiDraft, PublishDetails, SellerDraft } from './listingBatch';

const mediaId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';
const ai: AiDraft = { title: '二手檯燈', description: '白色桌上型檯燈，功能待賣家確認。', brand: null, category: 'home', condition: 'USED',
  estimatedPriceLowTwd: 100, estimatedPriceHighTwd: 600, priceBasis: '依可見外觀粗估，非鑑價', evidence: ['可見燈罩', '可見電源線'],
  uncertainties: ['無法確認是否正常發光'], confidence: 0.8, source: 'MINIMAX_CODE_VISION' };
const draft: SellerDraft = { clientListingId: listingId, form: { ...emptyListingDraft(), title: '二手檯燈', description: '已確認正常發光', price: '350' }, touched: { price: true } };
const details: PublishDetails = { county: '臺北市', district: '中山區', latitude: '25.05', longitude: '121.53', meetup: true, shipping: false,
  negotiable: false, expiryDate: '', consent: true };

describe('web listing batch publication boundary', () => {
  it('never overwrites a seller-edited price with an AI midpoint', () => {
    const form = mergeAiDraft(draft.form, draft.touched, ai);
    expect(form.price).toBe('350');
    expect(form.title).toBe('二手檯燈');
  });

  it('parses a real private AI draft and rejects a malformed price range', () => {
    expect(parseAiState({ mediaId, status: 'COMPLETED', draft: ai }, mediaId).draft?.estimatedPriceLowTwd).toBe(100);
    expect(() => parseAiState({ mediaId, status: 'COMPLETED', draft: { ...ai, estimatedPriceLowTwd: 800 } }, mediaId)).toThrow();
  });

  it('requires explicit consent, location, real photo, and seller price before publication', () => {
    expect(() => buildPublishedListing(draft, mediaId, { ...details, consent: false })).toThrow('同意');
    expect(() => buildPublishedListing(draft, mediaId, { ...details, latitude: '' })).toThrow('位置');
    expect(() => buildPublishedListing({ ...draft, form: { ...draft.form, price: '' } }, mediaId, details)).toThrow('售價');
    expect(() => buildPublishedListing(draft, 'not-a-photo', details)).toThrow('識別碼');
    expect(buildPublishedListing(draft, mediaId, details)).toMatchObject({ publish: true, consentToMap: true, price: 350, mediaIds: [mediaId],
      clientListingId: listingId, location: { county: '臺北市', district: '中山區', latitude: 25.05, longitude: 121.53 } });
  });

  it('defaults expiry to server-side 30 days unless seller specifies a date', () => {
    expect(buildPublishedListing(draft, mediaId, details)).not.toHaveProperty('expiryDate');
  });

  it('never sends precise GPS coordinates in the publication request', () => {
    const body = buildPublishedListing(draft, mediaId, { ...details, latitude: '25.04312', longitude: '121.53678' });
    expect(body.location).toMatchObject({ latitude: 25.05, longitude: 121.53 });
    expect(JSON.stringify(body)).not.toContain('25.04312');
    expect(JSON.stringify(body)).not.toContain('121.53678');
  });

  it('keeps small supported photos intact and rejects unsupported large photos safely', async () => {
    const small = new File(['photo'], 'small.jpg', { type: 'image/jpeg' });
    expect(await prepareListingUploadFile(small)).toBe(small);
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.heic', { type: 'image/heic' });
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(prepareListingUploadFile(oversized)).rejects.toThrow('格式或大小不支援');
    vi.unstubAllGlobals();
  });

  it('shrinks a large browser photo to a private JPEG upload under the server limit', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['compressed'], { type: 'image/jpeg' })));
    try {
      const result = await prepareListingUploadFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
      expect(result.type).toBe('image/jpeg');
      expect(result.size).toBeLessThan(5 * 1024 * 1024);
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
      expect(close).toHaveBeenCalledOnce();
    } finally { getContext.mockRestore(); toBlob.mockRestore(); vi.unstubAllGlobals(); }
  });
});
