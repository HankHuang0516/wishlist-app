import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Api = typeof import('../lib/marketplaceApi');
let api: Api['api'], publicApi: Api['publicApi'];
const fetchMock = vi.fn();
const answer = (body: unknown = { from: 'early' }, init: ResponseInit = { status: 200 }) => new Response(JSON.stringify(body), init);
/** What the boot script leaves behind: when it asked, and each answer under the address it asked. */
const sent = (reads: Record<string, Promise<unknown>>, age = 0) => { window.__wishlistFirstScreen = { t: Date.now() - age, d: reads }; return reads; };
const load = async (address = '/api') => { vi.resetModules(); vi.doMock('../config', () => ({ API_URL: address })); ({ api, publicApi } = await import('../lib/marketplaceApi')); };

beforeEach(async () => {
  fetchMock.mockReset().mockImplementation(async () => answer({ from: 'network' }));
  vi.stubGlobal('fetch', fetchMock);
  await load();
});
afterEach(() => { delete window.__wishlistFirstScreen; vi.doUnmock('../config'); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('a public read the boot script already sent', () => {
  it('answers the page\'s request without a second request, and only once', async () => {
    const kept = sent({ '/api/source-leads/summary': Promise.resolve(answer({ count: 5 })), '/api/other': Promise.resolve(answer()) });
    await expect(publicApi('/source-leads/summary', { signal: new AbortController().signal })).resolves.toEqual({ count: 5 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Object.keys(kept)).toEqual(['/api/other']);
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/source-leads/summary');
  });

  it('is the request itself: a refusal is reported as one and starts the same cooldown', async () => {
    sent({ '/api/listings/limited': Promise.resolve(answer({ errorCode: 'RATE_LIMIT_EXCEEDED' }, { status: 429, headers: { 'Retry-After': '120' } })) });
    await expect(publicApi('/listings/limited')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfterMs: 120_000 });
    await expect(publicApi('/listings/another')).rejects.toMatchObject({ code: 'RATE_LIMIT_COOLDOWN' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing item as missing instead of asking again', async () => {
    sent({ '/api/listings/gone': Promise.resolve(answer({ error: 'gone' }, { status: 404 })) });
    await expect(publicApi('/listings/gone')).rejects.toMatchObject({ status: 404, message: 'gone' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps an answer without a body', async () => {
    sent({ '/api/listings/empty': Promise.resolve(new Response(null, { status: 204 })) });
    await expect(publicApi('/listings/empty')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['could not be had', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['is not an answer at all', () => Promise.resolve({ ok: true, status: 200, json: async () => ({ from: 'elsewhere' }) })],
    ['had already been read by something else', () => { const used = answer(); return used.text().then(() => used); }],
  ])('is asked for again by the page when it %s', async (_name, early) => {
    const kept = sent({ '/api/source-leads/summary': early() });
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(kept).toEqual({});
  });

  it('fails as a cancelled request does when the page stops waiting, and is not kept for later', async () => {
    const controller = new AbortController();
    const kept = sent({ '/api/source-leads/summary': new Promise(() => undefined) });
    const waiting = publicApi('/source-leads/summary', { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(kept).toEqual({});
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
  });

  it('is not handed to a request that was cancelled before it started, or while the answer was being handed over', async () => {
    sent({ '/api/a/b': Promise.resolve(answer()), '/api/c/d': Promise.resolve(answer()) });
    await expect(publicApi('/a/b', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    // The answer has arrived in full; the page gives up while it is being read out.
    const controller = new AbortController(), reason = new Error('left the page'), read = Response.prototype.json;
    vi.spyOn(Response.prototype, 'json').mockImplementationOnce(function (this: Response) { controller.abort(reason); return read.call(this); });
    await expect(publicApi('/c/d', { signal: controller.signal })).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is recognised whatever the spelling of the method', async () => {
    sent({ '/api/a/b': Promise.resolve(answer()) });
    await expect(publicApi('/a/b', { method: 'get' })).resolves.toEqual({ from: 'early' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([30_001, 3_600_000, -5_000])('is left unused when it was asked %i ms ago', async age => {
    const stale = answer();
    const kept = sent({ '/api/source-leads/summary': Promise.resolve(stale) }, age);
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
    expect(kept).toEqual({});
    await vi.waitFor(() => expect(stale.bodyUsed).toBe(true));
  });

  it('is still good just inside its lifetime', async () => {
    sent({ '/api/source-leads/summary': Promise.resolve(answer()) }, 29_000);
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'early' });
  });
});

describe('everything else asks for itself', () => {
  it.each<[string, (path: string) => Promise<unknown>]>([
    ['a signed-in read', path => api('synthetic-session', path)],
    ['a read with a header of its own', path => publicApi(path, { headers: { 'Accept-Language': 'en' } })],
    ['a read with any other setting', path => publicApi(path, { keepalive: true })],
  ])('%s', async (_name, read) => {
    const kept = sent({ '/api/source-leads/summary': Promise.resolve(answer()) });
    await read('/source-leads/summary');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(kept)).toEqual(['/api/source-leads/summary']);
  });

  it('a read of another address, however close', async () => {
    const kept = sent({ '/api/discovery?': Promise.resolve(answer()) });
    for (const path of ['/discovery', '/discovery?q=mac', '/discovery/cp?']) await expect(publicApi(path)).resolves.toEqual({ from: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Object.keys(kept)).toEqual(['/api/discovery?']);
    await expect(publicApi('/discovery?')).resolves.toEqual({ from: 'early' });
  });

  it('a build whose API is not at the address the boot script asked', async () => {
    await load('http://localhost:8000/api');
    const kept = sent({ '/api/source-leads/summary': Promise.resolve(answer()) });
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/source-leads/summary');
    expect(Object.keys(kept)).toEqual(['/api/source-leads/summary']);
  });

  it.each([undefined, null, 'text', { t: 1 }, { t: 1, d: null }, { t: 1, d: 'text' }])('a page whose note from the boot script is %j', async note => {
    (window as { __wishlistFirstScreen?: unknown }).__wishlistFirstScreen = note;
    await expect(publicApi('/source-leads/summary')).resolves.toEqual({ from: 'network' });
  });

  it('and without anything waiting the request leaves at once, as it always did', async () => {
    const waiting = publicApi('/source-leads/summary');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' } });
    await waiting;
  });
});

describe('an answer nobody asked for', () => {
  it('is let go once it is too old to be used', async () => {
    vi.useFakeTimers();
    const unused = answer();
    const kept = sent({ '/api/never/asked': Promise.resolve(unused) });
    await load();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(Object.keys(kept)).toEqual(['/api/never/asked']);
    expect(unused.bodyUsed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve(); await Promise.resolve();
    expect(kept).toEqual({});
    expect(unused.bodyUsed).toBe(true);
  });
});
