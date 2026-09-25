import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPendingUploads, loadPrivateMediaPages, readPendingUploads, reconcilePendingUploads, rememberPendingUpload } from './listingUploadJournal';

const uploadId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const item = { id: mediaId, clientUploadId: uploadId, listingId: null, wishItemId: null };

describe('private web upload recovery journal', () => {
  beforeEach(() => localStorage.clear());

  it('collects every private page and rejects repeated media IDs', async () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    const page = vi.fn(async (cursor: string | null) => cursor
      ? { items: rows.slice(30), nextCursor: null }
      : { items: rows.slice(0, 30), nextCursor: rows[29].id });
    expect(await loadPrivateMediaPages(page)).toEqual(rows);
    expect(page).toHaveBeenNthCalledWith(2, rows[29].id);
    await expect(loadPrivateMediaPages(async () => ({ items: [rows[0], rows[0]], nextCursor: null }))).rejects.toThrow();
  });

  it('persists only an account-scoped upload identifier and clears the exact entry', () => {
    rememberPendingUpload(19, uploadId);
    expect(readPendingUploads(19)).toHaveLength(1);
    expect(readPendingUploads(20)).toEqual([]);
    expect(JSON.stringify(readPendingUploads(19))).not.toContain('photo-bytes');
    forgetPendingUploads(19, [uploadId]);
    expect(readPendingUploads(19)).toEqual([]);
  });

  it('refreshes a stale unused list after owner UUID lookup confirms a committed private photo', async () => {
    rememberPendingUpload(19, uploadId);
    const lookup = vi.fn(async () => item);
    const refresh = vi.fn(async () => [item]);
    const result = await reconcilePendingUploads(19, [], lookup, refresh);
    expect(result).toEqual({ items: [item], unresolved: [] });
    expect(lookup).toHaveBeenCalledWith(uploadId);
    expect(refresh).toHaveBeenCalledOnce();
    expect(readPendingUploads(19)).toEqual([]);
  });

  it('keeps the same UUID after an uncertain 404, never guessing the upload failed', async () => {
    rememberPendingUpload(19, uploadId);
    const refresh = vi.fn(async () => []);
    const result = await reconcilePendingUploads(19, [], async () => { throw new Error('404'); }, refresh);
    expect(result.unresolved).toEqual([uploadId]);
    expect(refresh).not.toHaveBeenCalled();
    expect(readPendingUploads(19)).toHaveLength(1);
  });

  it('does not discard a private photo UUID when even the refreshed list is stale', async () => {
    rememberPendingUpload(19, uploadId);
    const result = await reconcilePendingUploads(19, [], async () => item, async () => []);
    expect(result.unresolved).toEqual([uploadId]);
    expect(readPendingUploads(19)).toHaveLength(1);
  });

  it('does not restore a photo already linked to a published listing', async () => {
    rememberPendingUpload(19, uploadId);
    const result = await reconcilePendingUploads(19, [], async () => ({ ...item, listingId: '33333333-3333-4333-8333-333333333333' }), async () => []);
    expect(result).toEqual({ items: [], unresolved: [] });
    expect(readPendingUploads(19)).toEqual([]);
  });

  it('rejects malformed journals instead of silently dropping recovery evidence', () => {
    localStorage.setItem('wishlist:listing-upload-pending:19', '{bad-json');
    expect(() => readPendingUploads(19)).toThrow('格式不正確');
  });
});
