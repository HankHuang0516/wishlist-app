import { describe, expect, it, vi } from 'vitest';
import { guestReadApi } from '../guestAccess';
const id = '1f7233de-f650-4938-a46d-97b419832519';
describe('anonymous browsing API boundary', () => {
  it.each(['/discovery', '/discovery?q=lamp&presentation=map', '/discovery/cp', '/discovery/products/listing/' + id,
    '/listings/' + id, '/users/7/storefront', '/users/7/storefront?cursor=' + id, '/product-interest?keys=listing%3A' + id])('allows a public read %s', async path => {
    const read = vi.fn(async () => ({ public: true })); await expect(guestReadApi(read as any)(path)).resolves.toEqual({ public: true });
    expect(read).toHaveBeenCalledOnce();
  });
  it.each(['/users/me', '/discovery/for-you', '/chat/conversations', '/product-wishes', '/users/7/storefront/../me', '//other.example/discovery', '/discovery#secret'])('blocks private or noncanonical read %s before networking', async path => {
    const read = vi.fn(); await expect(guestReadApi(read)(path)).rejects.toMatchObject({ status: 401 }); expect(read).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s and never forwards a previous account bearer', async method => {
    const read = vi.fn(), api = guestReadApi(read); await expect(api('/discovery', { method })).rejects.toMatchObject({ status: 401 });
    await expect(api('/discovery', { headers: { Authorization: 'Bearer synthetic-old-session' } })).rejects.toMatchObject({ status: 401 });
    expect(read).not.toHaveBeenCalled();
  });
});
