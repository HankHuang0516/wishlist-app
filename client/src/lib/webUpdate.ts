export type WebUpdateState = { status: 'idle' | 'checking' | 'current' | 'preparing' | 'ready' | 'unavailable'; target?: string };
const validVersion = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,7})$/.test(value);

function admitted(response: Response, path: string, html: boolean) {
  const url = new URL(response.url);
  const query = [...url.searchParams];
  if (response.status !== 200 || response.redirected || url.origin !== location.origin || url.pathname !== path || url.hash ||
    query.some(([key, value]) => !html || key !== '__WB_REVISION__' || !/^[a-f0-9]{32,64}$/.test(value)) ||
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== (html ? 'text/html' : 'application/json')) throw Error('Update metadata unavailable');
}

/** Compare fresh server metadata with the index actually served by the controlling
 * worker. no-store does not bypass a worker's precache: that is the readiness proof. */
export async function probeWebUpdate(currentVersion: string, signal: AbortSignal): Promise<WebUpdateState> {
  const options: RequestInit = { cache: 'no-store', credentials: 'omit', redirect: 'error', signal };
  const server = await fetch(new URL('/web-version.json', location.origin).href, options);
  admitted(server, '/web-version.json', false);
  const body = await server.text(); if (body.length > 256) throw Error('Update metadata unavailable');
  const data: unknown = JSON.parse(body);
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || !validVersion((data as { version?: unknown }).version)) throw Error('Update metadata unavailable');
  const target = (data as { version: string }).version;
  const shell = await fetch(new URL('/index.html', location.origin).href, options);
  admitted(shell, '/index.html', true);
  const html = await shell.text(); if (html.length > 1_048_576) throw Error('Update metadata unavailable');
  const tags = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('meta[name="wishlist-web-version"]');
  if (tags.length === 0) return { status: 'preparing', target }; // Existing workers predate this protocol.
  const installed = tags[0].getAttribute('content');
  if (tags.length !== 1 || !validVersion(installed)) throw Error('Update metadata unavailable');
  if (installed !== target) return { status: 'preparing', target };
  return { status: target === currentVersion ? 'current' : 'ready', target };
}

export const webUpdateNavigation = { reload: () => window.location.reload() };
