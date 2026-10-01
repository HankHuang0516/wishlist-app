import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from './marketplaceApi';
import { lookupWishPhotoRemoval, parseWishPhotoRemovalJournal, parseWishPhotoRemovalReceipt, submitWishPhotoRemoval } from './wishPhotoRemoval';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./marketplaceApi', async original => ({ ...await original<typeof import('./marketplaceApi')>(), api }));
const uploadId = 'b5abf861-a66d-4072-876b-4f0ab3172dac', mediaId = 'fab22941-2df0-4ca4-90c2-70c504527243';
const photoBody = JSON.stringify({ version: 1, clientUploadId: uploadId, digest: 'a'.repeat(64) });
const raw = JSON.stringify({ version: 1, mediaId, photoBody });
const receipt = { clientUploadId: uploadId, mediaId, removed: true, removedAt: '2026-10-01T01:00:00.000Z', cleanupPending: true };
const store = () => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn() });
beforeEach(() => api.mockReset());
describe('durable unused wish photo removal', () => {
  it('retains only the original upload identity/digest and media identity, with exact journal validation', () => {
    expect(parseWishPhotoRemovalJournal(raw).photoBody).toBe(photoBody);
    for (const patch of [{ version: 2 }, { mediaId: 'bad' }, { photoBody: '{}' }, { token: 'synthetic' }, { imageUrl: 'https://example.invalid/private.jpg' }]) {
      expect(() => parseWishPhotoRemovalJournal(JSON.stringify({ version: 1, mediaId, photoBody, ...patch }))).toThrow();
    }
    expect(() => parseWishPhotoRemovalJournal('broken')).toThrow();
  });
  it('accepts only the original removal identity and a real canonical timestamp/cleanup state', () => {
    expect(parseWishPhotoRemovalReceipt(receipt, raw)).toEqual(receipt);
    for (const patch of [{ clientUploadId: mediaId }, { mediaId: uploadId }, { removed: false }, { removed: 'true' }, { cleanupPending: null }, { removedAt: 'not-a-date' }, { removedAt: '2026-10-01' }]) {
      expect(() => parseWishPhotoRemovalReceipt({ ...receipt, ...patch }, raw)).toThrow();
    }
    expect(parseWishPhotoRemovalReceipt({ ...receipt, clientUploadId: uploadId.toUpperCase(), mediaId: mediaId.toUpperCase(), providerSecret: 'synthetic' }, raw)).not.toHaveProperty('providerSecret');
  });
  it('restores with GET only and never turns 404 into a successful removal', async () => {
    api.mockResolvedValueOnce(receipt).mockRejectedValueOnce(new ApiFailure('unknown receipt', 404));
    expect(await lookupWishPhotoRemoval('fixture', raw)).toEqual(receipt);
    await expect(lookupWishPhotoRemoval('fixture', raw)).rejects.toMatchObject({ status: 404 });
    expect(api.mock.calls.every(call => call[2] === undefined)).toBe(true);
    expect(api).toHaveBeenCalledWith('fixture', '/native-wishes/photo-removals/' + uploadId);
  });
  it('persists before posting, and explicit repeats retain the same original IDs without early cleanup', async () => {
    const pending = store(); api.mockResolvedValue(receipt);
    await submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => true);
    await submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => true);
    expect(pending.save).toHaveBeenCalledWith('scope', raw);
    expect(pending.save.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder[0]);
    expect(api.mock.calls.map(call => call[2])).toEqual(Array(2).fill({ method: 'POST', body: JSON.stringify({ mediaId }) }));
    expect(pending.clear).not.toHaveBeenCalled();
  });
  it('does not auto-repeat or clear after a lost response or a mismatched receipt', async () => {
    const pending = store(); api.mockRejectedValueOnce(new Error('lost ACK')).mockResolvedValueOnce({ ...receipt, mediaId: uploadId });
    await expect(submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => true)).rejects.toThrow();
    expect(api).toHaveBeenCalledTimes(1);
    await expect(submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => true)).rejects.toThrow();
    expect(pending.clear).not.toHaveBeenCalled();
  });
  it('makes no request if persistence fails or the account leaves before persistence completes', async () => {
    const pending = store(); pending.save.mockRejectedValueOnce(new Error('unavailable'));
    await expect(submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => true)).rejects.toThrow();
    await expect(submitWishPhotoRemoval('fixture', raw, pending, 'scope', () => false)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  });
});
