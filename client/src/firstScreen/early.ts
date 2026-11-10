/* The page's side of the first-screen boot script (boot.ts).
 *
 * For a visitor who is not signed in, the boot script may already have sent the public reads the page is about to
 * make, in the same wave as the page's code. `earlyResponse` hands such an answer to the one request it belongs to:
 * the same address, asked the same way (a GET without credentials and without headers of its own). For anything
 * else, and on any failure, nothing is waiting and the page asks for itself, exactly as it did before.
 */
import type { FirstScreenEnv } from './boot';

type Store = NonNullable<FirstScreenEnv['__wishlistFirstScreen']>;
declare global { interface Window { __wishlistFirstScreen?: Store } }

// An answer older than this is not shown as if it had just been asked for.
const LIFETIME = 30_000;
// What a request may carry and still be the plain read the boot script sent.
const PLAIN = ['credentials', 'headers', 'method', 'signal'];

function store(): Store | undefined {
  const value = typeof window === 'undefined' ? undefined : window.__wishlistFirstScreen;
  return value && typeof value === 'object' && value.d && typeof value.d === 'object' ? value : undefined;
}

function plain(init: RequestInit) {
  return Object.keys(init).every(key => PLAIN.includes(key)) && (init.method ?? 'GET').toUpperCase() === 'GET'
    && init.credentials === 'omit' && [...new Headers(init.headers)].length === 0;
}

/** Lets go of an answer nobody is going to read. */
function discard(pending: unknown) {
  void Promise.resolve(pending).then(response => response instanceof Response ? response.body?.cancel() : undefined).catch(() => undefined);
}

/** The answer with its body already read, so that nothing about it depends on the network any more. */
async function buffered(response: unknown): Promise<Response> {
  if (!(response instanceof Response)) throw new TypeError('Not a response.');
  const bodiless = [101, 103, 204, 205, 304].includes(response.status);
  return new Response(bodiless ? null : await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** `work`, given up as soon as the request it is for has been cancelled. */
function whileWanted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancelled = () => reject(signal.reason);
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
    if (signal.aborted) cancelled(); else signal.addEventListener('abort', cancelled, { once: true });
  });
}

/** Null, at once, unless the boot script has already sent this very read. Otherwise its answer, whatever its
 *  status, or null when it could not be had; a request cancelled while it waits fails the way `fetch` would. */
export function earlyResponse(url: string, init: RequestInit, signal: AbortSignal): Promise<Response | null> | null {
  try {
    const waiting = store();
    if (!waiting || !Object.hasOwn(waiting.d, url) || !plain(init)) return null;
    const pending = waiting.d[url];
    delete waiting.d[url]; // One answer serves one request.
    const age = Date.now() - waiting.t;
    if (!(age >= 0 && age <= LIFETIME)) { discard(pending); return null; }
    return whileWanted(Promise.resolve(pending).then(buffered), signal).catch(() => {
      if (signal.aborted) throw signal.reason;
      return null; // The early request failed: the page asks again and reports what it then finds.
    });
  } catch {
    return null;
  }
}

// Whatever nobody asked for is let go once it is too old to be used.
const left = store();
if (left) setTimeout(() => {
  for (const url of Object.keys(left.d)) { discard(left.d[url]); delete left.d[url]; }
}, LIFETIME);
