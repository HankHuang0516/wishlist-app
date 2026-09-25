import { describe, expect, it, vi } from 'vitest';
import { reconcilePrivateBatchCaptures } from '../listingCaptureRecovery';
import type { LookupPhotoRecord } from '../listingCaptureRecovery';

const capture = { clientUploadId: '0a35d55f-074d-4f15-84e6-68f9fd64b87a', uri: 'file:///private/lamp.jpg' };
const record: LookupPhotoRecord = { id: '97b5a765-1761-4285-bb3e-d694f688dc0f', imageUrl: 'private-image',
  thumbnailUrl: 'private-thumbnail', width: 640, height: 480, byteSize: 12345, linked: false };

describe('batch capture recovery after a lost upload reply', () => {
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
