import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../api';
import { uploadPhotoRecord } from '../photoUploadRecovery';

const id = '9a318c01-0844-4d79-b8c0-b544482a6f96';
const record = { id, imageUrl: `https://example.com/api/listing-media/${id}/image`,
  thumbnailUrl: `https://example.com/api/listing-media/${id}/thumbnail`, width: 640, height: 480, byteSize: 12345 };
const key = '564d1185-9129-4a47-97af-bf3ad3210a66';

describe('slow Flickr upload reconciliation', () => {
  it('allows a longer timeout only for the photo POST', async () => {
    const api = vi.fn().mockResolvedValue(record) as unknown as ReturnType<typeof createApi>;
    await expect(uploadPhotoRecord(api, 'https://example.com/api', key, new FormData())).resolves.toEqual(record);
    expect(api).toHaveBeenCalledWith('/listing-media', expect.objectContaining({ method: 'POST', timeoutMs: 60000 }));
  });
  it('recovers a committed photo after the POST response is lost', async () => {
    const api = vi.fn().mockRejectedValueOnce(new Error('network_lost')).mockResolvedValueOnce(record) as unknown as ReturnType<typeof createApi>;
    await expect(uploadPhotoRecord(api, 'https://example.com/api', key, new FormData())).resolves.toEqual(record);
    expect(api).toHaveBeenLastCalledWith(`/listing-media/by-upload-id/${key}`, { timeoutMs: 5000 });
  });
  it('never recovers a conflicting UUID that may belong to different pixels', async () => {
    const api = vi.fn().mockRejectedValue(new ApiError(409, 'PHOTO_UPLOAD_CONFLICT')) as unknown as ReturnType<typeof createApi>;
    await expect(uploadPhotoRecord(api, 'https://example.com/api', key, new FormData())).rejects.toEqual(new ApiError(409, 'PHOTO_UPLOAD_CONFLICT'));
    expect(api).toHaveBeenCalledTimes(1);
  });
});
