import { describe, expect, it, vi } from 'vitest';
import { privateListingThumbnailDataUri } from '../privateListingThumbnail';

const id = '9a318c01-0844-4d79-b8c0-b544482a6f96';
const api = 'https://example.com';
const url = `${api}/api/listing-media/${id}/thumbnail`;
const signal = () => new AbortController().signal;
const data = 'data:image/webp;base64,YQ==';
const response = ({ status = 200, location = url, type = 'image/webp', size = 1, redirected = false } = {}) => ({
  ok: status >= 200 && status < 300, status, url: location, redirected,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? type : null },
  blob: async () => new Blob([new Uint8Array(size)], { type }),
}) as unknown as Response;

describe('authenticated in-memory private listing thumbnail', () => {
  it('fetches only the exact API-owned URL with the account token and no redirect', async () => {
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    const toDataUri = vi.fn(async () => data);
    await expect(privateListingThumbnailDataUri(url, api, 'synthetic-token', signal(), false,
      { fetcher, toDataUri })).resolves.toBe(data);
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({
      headers: { Authorization: 'Bearer synthetic-token' }, redirect: 'error' }));
    expect(toDataUri).toHaveBeenCalledOnce();
  });

  it.each([`${api}.attacker.test/api/listing-media/${id}/thumbnail`, `${url}?share=1`,
    `https://evil.example/api/listing-media/${id}/thumbnail`, `${api}/api/listing-media/bad/thumbnail`])
  ('rejects an untrusted private thumbnail before sending any credential: %s', async bad => {
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(privateListingThumbnailDataUri(bad, api, 'synthetic-token', signal(), false,
      { fetcher, toDataUri: async () => data })).rejects.toThrow('Untrusted private thumbnail');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { status: 404 }, { location: 'https://evil.example/photo' }, { redirected: true }, { type: 'text/html' },
  ])('rejects an inaccessible, redirected or non-image response: %j', async options => {
    await expect(privateListingThumbnailDataUri(url, api, 'synthetic-token', signal(), false,
      { fetcher: (async () => response(options)) as typeof fetch, toDataUri: async () => data })).rejects.toThrow('Private thumbnail unavailable');
  });

  it.each([0, 512_001])('refuses a %i-byte private image in memory', async size => {
    const toDataUri = vi.fn(async () => data);
    await expect(privateListingThumbnailDataUri(url, api, 'synthetic-token', signal(), false,
      { fetcher: (async () => response({ size })) as typeof fetch, toDataUri })).rejects.toThrow('Invalid private thumbnail size');
    expect(toDataUri).not.toHaveBeenCalled();
  });

  it('rejects a decoded payload with a MIME mismatch and an aborted request', async () => {
    await expect(privateListingThumbnailDataUri(url, api, 'synthetic-token', signal(), false,
      { fetcher: (async () => response()) as typeof fetch, toDataUri: async () => 'data:text/html;base64,YQ==' }))
      .rejects.toThrow('Invalid private thumbnail data');
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
    await expect(privateListingThumbnailDataUri(url, api, 'synthetic-token', controller.signal, false,
      { fetcher, toDataUri: async () => data })).rejects.toThrow('Private thumbnail cancelled');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
