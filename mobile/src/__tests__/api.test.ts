import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError, createApi, validateApiUrl } from '../api';

afterEach(() => vi.unstubAllGlobals());

describe('native API safety', () => {
  it('normalizes the API suffix', () => expect(validateApiUrl('https://example.com/api/')).toBe('https://example.com'));
  it.each(['http://example.com', 'https://u:p@example.com', 'https://example.com?key=x', 'https://example.com#secret', 'file:///tmp/x'])
    ('rejects unsafe API origins %s', value => expect(() => validateApiUrl(value)).toThrow());
  it('allows HTTP only for explicit loopback development', () => {
    expect(validateApiUrl('http://localhost:3000', true)).toBe('http://localhost:3000');
    expect(() => validateApiUrl('http://example.com', true)).toThrow();
  });
  it('uses the current token and does not log or embed it in a URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    const api = createApi('https://example.com', () => 'test-only-token');
    await expect(api('/users/me')).resolves.toEqual({ id: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api/users/me');
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-only-token');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });
  it('does not disclose a server stack or secret in user-facing errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'private-secret-stack' }) }));
    await expect(createApi('https://example.com', () => null)('/users/me')).rejects.toEqual(new ApiError(500));
  });
  it('uses a bounded per-request timeout without sending it to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const api = createApi('https://example.com', () => null);
    await api('/listing-media', { method: 'POST', timeoutMs: 60000 });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
    await expect(api('/listing-media', { timeoutMs: 120001 })).rejects.toThrow('無效的 API 等待時間');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['//evil.example/path', '/https://evil.example', '/users/../secret', '/users/%2e%2e/secret', '/users?x=%GG', '/users#secret', '/users?x=https://evil.example'])('rejects path escape %s', async path => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createApi('https://example.com', () => null)(path)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['/listing-media/9a318c01-0844-4d79-b8c0-b544482a6f96', '/listings?q=%E9%9B%BB%E8%85%A6+Apple&bbox=121%2C23.5%2C122%2C24&minPrice=10.25'])('supports UUIDs and safely encoded decimal/text queries %s', async path => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', fetchMock);
    await createApi('https://example.com', () => null)(path);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api' + path);
  });
});
