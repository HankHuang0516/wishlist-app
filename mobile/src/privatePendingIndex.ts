import type { PrivateStore } from './pendingStore';

// SecureStore has no key enumeration. Register every exact key BEFORE a
// private write, including generations whose manifest never commits.
const PAGE_COUNT = 128;
const PAGE_SIZE = 8;
const INDEX_VERSION = 1;
const scopePattern = /^wishlist\.pending\.v1\.[a-f0-9]{64}\.[1-9][0-9]{0,9}$/;
const keyPattern = /^(wishlist\.pending\.v1\.[a-f0-9]{64}\.[1-9][0-9]{0,9})\.(listing|wish-create|listing-report|(?:message|meetup)\.[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(?:\.[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:[0-9]|[1-3][0-9]|40))?$/i;
export class PrivatePendingIndexError extends Error {
  constructor() { super('無法安全盤點或清理本人待確認資料，尚未確認裝置清理完成。'); }
}
function validateScope(scope: string) {
  if (!scopePattern.test(scope) || Number(scope.split('.').at(-1)) > 2147483647) throw new PrivatePendingIndexError();
  return scope;
}
function keyScope(key: string) {
  const match = key.length <= 220 ? keyPattern.exec(key) : null;
  if (!match || key !== key.toLowerCase()) throw new PrivatePendingIndexError();
  return validateScope(match[1]);
}
const indexBase = (scope: string) => scope.replace('wishlist.pending.v1.', 'wishlist.private-index.v1.');
const pageKey = (scope: string, page: number) => `${indexBase(scope)}.${page}`;
const retiredKey = (scope: string) => `${indexBase(scope)}.retired`;
function encodePage(keys: string[]) {
  const encoded = JSON.stringify({ v: INDEX_VERSION, keys });
  // ASCII only, bounded below SecureStore's conservative record budget.
  if (keys.length > PAGE_SIZE || encoded.length > 1900) throw new PrivatePendingIndexError();
  return encoded;
}
function parsePage(encoded: string, scope: string): string[] {
  if (encoded.length > 1900) throw new PrivatePendingIndexError();
  const page = JSON.parse(encoded) as { v?: unknown; keys?: unknown };
  if (!page || Object.keys(page).sort().join(',') !== 'keys,v' || page.v !== INDEX_VERSION || !Array.isArray(page.keys) || page.keys.length > PAGE_SIZE) throw new PrivatePendingIndexError();
  for (const key of page.keys) if (typeof key !== 'string' || keyScope(key) !== scope) throw new PrivatePendingIndexError();
  if (new Set(page.keys).size !== page.keys.length) throw new PrivatePendingIndexError();
  return page.keys;
}
export function createPrivatePendingIndex(store: PrivateStore) {
  const queues = new Map<string, Promise<unknown>>();
  const cache = new Map<string, string[][]>();
  function serial<T>(scope: string, work: () => Promise<T>): Promise<T> {
    try { validateScope(scope); } catch { return Promise.reject(new PrivatePendingIndexError()); }
    const previous = queues.get(scope) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work).catch(() => {
      cache.delete(scope); // Ambiguous native replies must be reread, not trusted.
      throw new PrivatePendingIndexError();
    });
    queues.set(scope, next);
    void next.finally(() => { if (queues.get(scope) === next) queues.delete(scope); }).catch(() => undefined);
    return next;
  }
  async function pages(scope: string) {
    const saved = cache.get(scope);
    if (saved) return saved;
    const loaded: string[][] = [];
    const known = new Set<string>();
    for (let page = 0; page < PAGE_COUNT; page++) {
      const encoded = await store.get(pageKey(scope, page));
      const keys = encoded === null ? [] : parsePage(encoded, scope);
      for (const key of keys) { if (known.has(key)) throw new PrivatePendingIndexError(); known.add(key); }
      loaded.push(keys);
    }
    cache.set(scope, loaded);
    return loaded;
  }
  async function retired(scope: string) {
    const marker = await store.get(retiredKey(scope));
    if (marker !== null && marker !== '1') throw new PrivatePendingIndexError();
    return marker === '1';
  }
  async function register(scope: string, key: string) {
    const all = await pages(scope);
    if (all.some(page => page.includes(key))) return;
    const index = all.findIndex(page => page.length < PAGE_SIZE);
    if (index < 0) throw new PrivatePendingIndexError();
    const next = [...all[index], key];
    await store.set(pageKey(scope, index), encodePage(next));
    all[index] = next;
  }
  async function unregister(scope: string, key: string) {
    const all = await pages(scope);
    const index = all.findIndex(page => page.includes(key));
    if (index < 0) return;
    const next = all[index].filter(value => value !== key);
    // Persist an empty page rather than relying on ambiguous marker deletion.
    await store.set(pageKey(scope, index), encodePage(next));
    all[index] = next;
  }
  function runKey<T>(key: string, work: (scope: string) => Promise<T>) {
    try { const scope = keyScope(key); return serial(scope, () => work(scope)); }
    catch { return Promise.reject(new PrivatePendingIndexError()); }
  }
  const privateStore: PrivateStore = {
    get: key => runKey(key, async scope => {
      if (await retired(scope)) return null;
      await pages(scope); // Corrupt indexes fail closed, even for legacy reads.
      const value = await store.get(key);
      if (value !== null) await register(scope, key);
      return value;
    }),
    set: (key, value) => runKey(key, async scope => {
      if (await retired(scope)) throw new PrivatePendingIndexError();
      await register(scope, key);
      await store.set(key, value);
    }),
    remove: key => runKey(key, async scope => {
      await pages(scope);
      await store.remove(key); // Payload FIRST: never lose the last cleanup hint.
      await unregister(scope, key);
    }),
  };
  async function erase(scope: string): Promise<{ remaining: number }> {
    return serial(scope, async () => {
      if (!await retired(scope)) await store.set(retiredKey(scope), '1'); // Fence late component writes durably.
      const all = await pages(scope);
      const keys = all.flat();
      for (const key of keys) {
        try { await store.remove(key); await unregister(scope, key); }
        catch { cache.delete(scope); } // Keep failed payloads/hints for explicit retry.
      }
      return { remaining: (await pages(scope)).flat().length };
    });
  }
  return { privateStore, erase };
}
