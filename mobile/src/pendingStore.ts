import { uuid } from './listingForm';
export type PrivateStore = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };
export class PendingStoreError extends Error { constructor() { super('無法安全恢復或保存待確認資料；尚未重新建立請求。'); } }
type Manifest = { generation: string; count: number };
function manifest(value: string): Manifest {
  try {
    const parsed = JSON.parse(value);
    if (parsed?.v !== 1 || !uuid(parsed.generation) || !Number.isSafeInteger(parsed.count) || parsed.count < 1 || parsed.count > 41) throw new Error();
    return { generation: parsed.generation, count: parsed.count };
  } catch { throw new PendingStoreError(); }
}
export function pendingChunks(body: string) {
  if (!body || body.length > 16000 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(body)) throw new PendingStoreError();
  // Whole Unicode codepoints, at most 400 UTF-16 units (<1201 UTF-8 bytes).
  // No oversized single Keychain record or split surrogate replacement.
  const chunks: string[] = []; let current = '';
  for (const point of body) { if (current.length + point.length > 400) { chunks.push(current); current = ''; } current += point; }
  if (current) chunks.push(current); return chunks;
}
export function createPendingStore(store: PrivateStore, newUUID: () => string) {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(key)) return Promise.reject(new PendingStoreError());
    const previous = queues.get(key) ?? Promise.resolve(); const next = previous.catch(() => undefined).then(work).catch(() => { throw new PendingStoreError(); });
    queues.set(key, next); void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined); return next;
  }
  const chunkKey = (key: string, info: Manifest, index: number) => `${key}.${info.generation}.${index}`;
  async function read(key: string) {
    const pointer = await store.get(key); if (pointer === null) return null;
    const info = manifest(pointer); const values: string[] = [];
    for (let index = 0; index < info.count; index++) {
      const value = await store.get(chunkKey(key, info, index));
      if (value === null || value.length > 400) throw new PendingStoreError(); values.push(value);
    }
    const body = values.join(''); pendingChunks(body); return body;
  }
  return {
    get: (key: string) => serial(key, () => read(key)),
    save: (key: string, body: string) => serial(key, async () => {
      const chunks = pendingChunks(body); const existing = await read(key);
      if (existing !== null) { if (existing !== body) throw new PendingStoreError(); return; }
      const generation = newUUID(); if (!uuid(generation)) throw new PendingStoreError();
      const info = { generation, count: chunks.length }; let written = 0;
      try {
        for (const [index, value] of chunks.entries()) { written++; await store.set(chunkKey(key, info, index), value); }
        // Commit the small pointer LAST. HTTP writes only happen after save
        // returns, so interrupted chunk writes cannot produce a server send.
        await store.set(key, JSON.stringify({ v: 1, ...info }));
      } catch {
        // A native failure may be ambiguous AFTER committing the pointer.
        // Never delete a possibly committed generation if its lookup fails.
        try {
          const pointer = await store.get(key);
          if (pointer !== null) { if (manifest(pointer).generation === generation && await read(key) === body) return; throw new PendingStoreError(); }
          await Promise.allSettled(Array.from({ length: written }, (_, index) => store.remove(chunkKey(key, info, index))));
        } catch { throw new PendingStoreError(); }
        throw new PendingStoreError();
      }
    }),
    clear: (key: string, expectedBody?: string) => serial(key, async () => {
      const pointer = await store.get(key); if (pointer === null) return false;
      // An old component can finish a send after the user reopened the room and
      // created a newer journal. Its acknowledgement may clear ONLY its body.
      if (expectedBody !== undefined && await read(key) !== expectedBody) return false;
      const info = manifest(pointer);
      // Remove commit marker first; a failed orphan cleanup never makes an
      // unrelated future request overwrite a generation still in use.
      await store.remove(key);
      await Promise.allSettled(Array.from({ length: info.count }, (_, index) => store.remove(chunkKey(key, info, index))));
      return true;
    }),
  };
}
export type PendingStore = ReturnType<typeof createPendingStore>;
