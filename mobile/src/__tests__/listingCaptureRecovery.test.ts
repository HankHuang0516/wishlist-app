import { describe, expect, it, vi } from 'vitest';
import { loadPrivateMediaPages, reconcilePrivateBatchCaptures } from '../listingCaptureRecovery';
import type { LookupPhotoRecord } from '../listingCaptureRecovery';

const capture = { clientUploadId: '0a35d55f-074d-4f15-84e6-68f9fd64b87a', uri: 'file:///private/lamp.jpg' };
const record: LookupPhotoRecord = { id: '97b5a765-1761-4285-bb3e-d694f688dc0f', imageUrl: 'private-image',
  thumbnailUrl: 'private-thumbnail', width: 640, height: 480, byteSize: 12345, linked: false };

describe('batch capture recovery after a lost upload reply', () => {
  it('loads later private pages before comparing a retained capture', async () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    const fetchPage = vi.fn(async (cursor: string | null) => cursor
      ? { items: rows.slice(30), nextCursor: null }
      : { items: rows.slice(0, 30), nextCursor: rows[29].id });
    const items = await loadPrivateMediaPages(fetchPage);
    expect(items).toHaveLength(32);
    expect(fetchPage).toHaveBeenNthCalledWith(2, rows[29].id);
    const result = await reconcilePrivateBatchCaptures(items, [capture], async () => ({ ...record, id: rows[31].id }), async () => []);
    expect(result.retryCaptures).toEqual([]);
    expect(result.releaseUploadIds).toEqual([capture.clientUploadId]);
  });

  it('rejects repeating or cross-page duplicate recovery cursors', async () => {
    const row = { id: '00000000-0000-4000-8000-000000000001' };
    await expect(loadPrivateMediaPages(async () => ({ items: [row, row], nextCursor: null }))).rejects.toThrow();
    await expect(loadPrivateMediaPages(async cursor => cursor
      ? { items: [row], nextCursor: null }
      : { items: Array.from({ length: 30 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })),
        nextCursor: '00000000-0000-4000-8000-000000000030' })).rejects.toThrow();
  });
  it('refreshes a stale unused-list snapshot before releasing the local photo', async () => {
    const refresh = vi.fn(async () => [{ ...record, clientUploadId: capture.clientUploadId }]);
    const result = await reconcilePrivateBatchCaptures([], [capture], async () => record, refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.items).toHaveLength(1);
    expect(result.retryCaptures).toEqual([]);
    expect(result.releaseUploadIds).toEqual([capture.clientUploadId]);
  });

  it('retains device pixels if the required refresh fails', async () => {
    const result = await reconcilePrivateBatchCaptures([], [capture], async () => record,
      async () => { throw new Error('temporary outage'); });
    expect(result.items).toEqual([]);
    expect(result.retryCaptures).toEqual([capture]);
    expect(result.releaseUploadIds).toEqual([]);
  });

  it('does not offer a duplicate card when the unused list already has this upload ID but lookup fails', async () => {
    const listed = { ...record, clientUploadId: capture.clientUploadId };
    const refresh = vi.fn(async () => []);
    const result = await reconcilePrivateBatchCaptures([listed], [capture], async () => {
      throw new Error('lookup unavailable');
    }, refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(result.items).toEqual([listed]);
    expect(result.retryCaptures).toEqual([]);
    expect(result.releaseUploadIds).toEqual([capture.clientUploadId]);
  });

  it('keeps an unconfirmed upload on device and drops a confirmed already-linked upload', async () => {
    const missing = await reconcilePrivateBatchCaptures([], [capture], async () => { throw new Error('404'); }, async () => []);
    expect(missing.retryCaptures).toEqual([capture]);
    const vanished = await reconcilePrivateBatchCaptures([], [capture], async () => record, async () => []);
    expect(vanished.retryCaptures).toEqual([capture]);
    const linked = await reconcilePrivateBatchCaptures([], [capture], async () => ({ ...record, linked: true }), async () => []);
    expect(linked.retryCaptures).toEqual([]);
    expect(linked.releaseUploadIds).toEqual([capture.clientUploadId]);
  });
});
