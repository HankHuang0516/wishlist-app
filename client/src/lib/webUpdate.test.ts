import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeWebUpdate } from './webUpdate';
const origin = location.origin;
function response(path: string, body: string, type: string, extra: Partial<Response> = {}) {
  return { status: 200, redirected: false, url: origin + path, headers: new Headers({ 'Content-Type': type }), text: async () => body, ...extra } as Response;
}
const html = (version: string) => `<html><head><meta name="wishlist-web-version" content="${version}"></head></html>`;
function fixture(serverVersion: string, shellVersion?: string, extra: Partial<Response> = {}) {
  const fetcher = vi.fn().mockResolvedValueOnce(response('/web-version.json', JSON.stringify({ version: serverVersion }), 'application/json'))
    .mockResolvedValueOnce(response('/index.html', shellVersion ? html(shellVersion) : '<html>legacy shell</html>', 'text/html', extra));
  vi.stubGlobal('fetch', fetcher);return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe('website update readiness', () => {
  it('requires the fresh server version and actual served shell to agree before offering an update', async () => {
    const fetcher = fixture('2.0.901', '2.0.900');
    expect(await probeWebUpdate('2.0.899', new AbortController().signal)).toEqual({ status: 'preparing', target: '2.0.901' });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([origin + '/web-version.json', origin + '/index.html']);
    for (const [, init] of fetcher.mock.calls) { expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });expect(init.body).toBeUndefined();expect(init.headers).toBeUndefined(); }
  });
  it('admits a prepared release and permits an intentional server rollback without inventing a newer version', async () => {
    fixture('2.0.901', '2.0.901');expect(await probeWebUpdate('2.0.900', new AbortController().signal)).toEqual({ status: 'ready', target: '2.0.901' });
    fixture('2.0.899', '2.0.899');expect(await probeWebUpdate('2.0.900', new AbortController().signal)).toEqual({ status: 'ready', target: '2.0.899' });
  });
  it('reports current only after confirming the worker-served shell, and treats legacy metadata as still preparing', async () => {
    fixture('2.0.900', '2.0.900');expect(await probeWebUpdate('2.0.900', new AbortController().signal)).toEqual({ status: 'current', target: '2.0.900' });
    fixture('2.0.901');expect(await probeWebUpdate('2.0.900', new AbortController().signal)).toEqual({ status: 'preparing', target: '2.0.901' });
  });
  it('accepts the controlling worker precache revision URL without accepting arbitrary query parameters', async () => {
    fixture('2.0.901', '2.0.901', { url: origin + '/index.html?__WB_REVISION__=' + 'a'.repeat(32) });
    expect((await probeWebUpdate('2.0.900', new AbortController().signal)).status).toBe('ready');
    fixture('2.0.901', '2.0.901', { url: origin + '/index.html?token=synthetic' });
    await expect(probeWebUpdate('2.0.900', new AbortController().signal)).rejects.toThrow();
  });
  it.each([
    response('/web-version.json', '{"version":"2.0.901","unknown":true}', 'application/json'),
    response('/web-version.json', '{"version":"2.0.0901"}', 'application/json'),
    response('/web-version.json', '<html>login</html>', 'text/html'),
    response('/web-version.json', '{"version":"2.0.901"}', 'application/json', { status: 401 }),
    response('/web-version.json', '{"version":"2.0.901"}', 'application/json', { redirected: true }),
    response('/web-version.json', '{"version":"2.0.901"}', 'application/json', { url: 'https://example.invalid/web-version.json' }),
    response('/web-version.json', ' '.repeat(257), 'application/json'),
  ])('refuses malformed, private, redirected or foreign server metadata %#', async value => {
    const fetcher = vi.fn().mockResolvedValue(value);vi.stubGlobal('fetch', fetcher);
    await expect(probeWebUpdate('2.0.900', new AbortController().signal)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects duplicate or malformed served-shell markers without calling an update ready', async () => {
    for (const body of [html('2.0.901') + html('2.0.902'), html('unknown')]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response('/web-version.json', '{"version":"2.0.901"}', 'application/json')).mockResolvedValueOnce(response('/index.html', body, 'text/html')));
      await expect(probeWebUpdate('2.0.900', new AbortController().signal)).rejects.toThrow();
    }
  });
});
