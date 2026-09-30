import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../config';
import PrivatePhoto from './PrivateMarketplacePhoto';
const id = 'f549f117-8d48-48ca-9a10-04d636c2922c', nativeURL = URL;
const create = vi.fn(), revoke = vi.fn();
const response = (blob = new Blob(['synthetic'], { type: 'image/png' })) => ({ ok: true, blob: async () => blob });
beforeEach(() => {
  create.mockReset().mockReturnValue('blob:synthetic'); revoke.mockReset();
  vi.stubGlobal('URL', class extends nativeURL { static createObjectURL = create; static revokeObjectURL = revoke; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('private same-backend photo transport', () => {
  it('uses bearer and no-store only for the trusted backend path, refusing redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    const view = render(<PrivatePhoto id={id} token="synthetic-token" label="聊天商品照片" compact />);
    const image = await screen.findByRole('img', { name: '聊天商品照片', exact: true }); expect(image).toHaveClass('h-16', 'w-16');
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/listing-media/${id}/thumbnail`, expect.objectContaining({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer synthetic-token' }, signal: expect.any(AbortSignal) }));
    view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:synthetic');
  });
  it('does not display an old-token response after switching account scope', async () => {
    let finish!: (value: unknown) => void; const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(response()); vi.stubGlobal('fetch', fetch);
    const view = render(<PrivatePhoto id={id} token="old" label="測試商品照片" />); await waitFor(() => expect(finish).toBeDefined());
    view.rerender(<PrivatePhoto id={id} token="new" label="測試商品照片" />); await screen.findByRole('img', { name: '測試商品照片', exact: true });
    await act(async () => finish(response())); expect(create).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });
  it.each(['text/html', 'image/svg+xml', 'application/json'])('rejects %s instead of putting it into a private image URL', async type => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new Blob(['synthetic'], { type })))); render(<PrivatePhoto id={id} token="synthetic" />);
    await screen.findByText('照片暫時無法載入'); expect(create).not.toHaveBeenCalled();
  });
  it('rejects oversized data and does not leave a failed thumbnail labelled as loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new Blob(['x'.repeat(5 * 1024 * 1024 + 1)], { type: 'image/png' })))); render(<PrivatePhoto id={id} token="synthetic" />);
    await screen.findByText('照片暫時無法載入'); expect(create).not.toHaveBeenCalled();
  });
});
