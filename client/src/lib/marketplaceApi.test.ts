import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let api: typeof import('./marketplaceApi').api;
let publicApi: typeof import('./marketplaceApi').publicApi;
let ApiFailure: typeof import('./marketplaceApi').ApiFailure;
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.resetModules(); ({ api, publicApi, ApiFailure } = await import('./marketplaceApi'));
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const rejected = (header?: string, body = '{"errorCode":"RATE_LIMIT_EXCEEDED"}') => new Response(body, { status: 429, headers: header ? { 'Retry-After': header } : {} });
const success = () => new Response('{"ok":true}', { status: 200 });
describe('origin request cooldown', () => {
  it('isolates public cooldown from account reads and omits public credentials', async () => {
    fetchMock.mockResolvedValueOnce(rejected('120')).mockImplementation(async () => success());
    await expect(publicApi('/listings/public-item')).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    await expect(api('synthetic-next', '/users/me')).resolves.toEqual({ ok: true });
    await expect(publicApi('/listings/another-item')).rejects.toMatchObject({ code: 'RATE_LIMIT_COOLDOWN' });
    await vi.advanceTimersByTimeAsync(120_000); expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(publicApi('/listings/public-item')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers).not.toHaveProperty('Authorization');
  });
  it('refuses write bodies and supplied authorization on a public read without fetching', async () => {
    await expect(publicApi('/listings/item', { method: 'POST', body: '{}' })).rejects.toThrow();
    await expect(publicApi('/listings/item', { body: '{}' })).rejects.toThrow();
    await expect(publicApi('/listings/item', { headers: new Headers({ authorization: 'Bearer synthetic' }) })).rejects.toThrow();
    await expect(publicApi('//untrusted.example')).rejects.toThrow('無效的 API 路徑。');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('honors Retry-After across routes and accounts without fetching or replaying a pending mutation', async () => {
    fetchMock.mockResolvedValueOnce(rejected('120')).mockImplementation(async () => success());
    await expect(api('synthetic-a', '/chat/conversations')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfterMs: 120_000 });
    const init = { method: 'POST', body: '{"clientMessageId":"original","text":"原文 250.7500 USD"}' };
    await expect(api('synthetic-b', '/chat/conversations/original/messages', init)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMIT_COOLDOWN' });
    await expect(api('synthetic-b', '/chat/conversations')).rejects.toBeInstanceOf(ApiFailure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(119_999);
    await expect(api('synthetic-a', '/chat/conversations')).rejects.toMatchObject({ retryAfterMs: 1 });
    await vi.advanceTimersByTimeAsync(1); expect(fetchMock).toHaveBeenCalledTimes(1);
    // Only a new explicit call dispatches the unchanged original operation.
    await expect(api('synthetic-b', '/chat/conversations/original/messages', init)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ ...init, cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer synthetic-b' } });
  });
  it('honors an HTTP-date deadline even when the 429 body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(rejected('Fri, 02 Oct 2026 15:03:00 GMT', 'not JSON')).mockImplementation(async () => success());
    await expect(api('synthetic', '/chat/conversations')).rejects.toMatchObject({ status: 429, retryAfterMs: 180_000 });
    await vi.advanceTimersByTimeAsync(180_000);
    await expect(api('synthetic', '/users/me')).resolves.toEqual({ ok: true });
  });
  it.each([undefined, 'invalid', '-1', '0', 'Fri, 02 Oct 2026 14:59:00 GMT'])('waits a minute for missing or invalid Retry-After %s', async header => {
    fetchMock.mockResolvedValueOnce(rejected(header)).mockImplementation(async () => success());
    await expect(api('synthetic', '/chat/conversations')).rejects.toMatchObject({ retryAfterMs: 60_000 });
    await vi.advanceTimersByTimeAsync(59_999);
    await expect(api('synthetic', '/chat/conversations')).rejects.toMatchObject({ code: 'RATE_LIMIT_COOLDOWN' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await api('synthetic', '/users/me'); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not delay later requests after an authentication failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"errorCode":"EXPIRED"}', { status: 401 })).mockImplementation(async () => success());
    await expect(api('synthetic', '/users/me')).rejects.toMatchObject({ status: 401, code: 'EXPIRED', retryAfterMs: 0 });
    await expect(api('synthetic-next', '/users/me')).resolves.toEqual({ ok: true }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['MONTHLY_LIMIT', 'CHAT_RATE_LIMIT', 'PHOTO_UPLOAD_BUSY'])('keeps domain-specific 429 %s isolated from account reads', async code => {
    fetchMock.mockResolvedValueOnce(rejected('120', JSON.stringify({ errorCode: code }))).mockImplementation(async () => success());
    await expect(api('synthetic', '/marketing/requests', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 429, code, retryAfterMs: 0 });
    await expect(api('synthetic', '/users/me')).resolves.toEqual({ ok: true }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('keeps path validation ahead of the cooldown and never dispatches an external path', async () => {
    fetchMock.mockResolvedValue(rejected('60')); await expect(api('synthetic', '/users/me')).rejects.toMatchObject({ status: 429 });
    await expect(api('synthetic', '//outside.test')).rejects.toThrow('無效的 API 路徑。'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it('account read saturation retains fallback and does not pause public reads or mutations', async () => {
  fetchMock.mockResolvedValueOnce(rejected('60', '{"errorCode":"ACCOUNT_READ_RATE_LIMIT"}')).mockImplementation(async () => success());
  await expect(api('synthetic', '/users/me')).rejects.toMatchObject({retryAfterMs:60000});
  await expect(api('synthetic', '/users/me/purchases')).rejects.toMatchObject({code:'RATE_LIMIT_COOLDOWN'});
  await expect(publicApi('/source-leads')).resolves.toEqual({ok:true});
  await expect(api('synthetic', '/users/me', {method:'PUT',body:'{}'})).resolves.toEqual({ok:true});
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
