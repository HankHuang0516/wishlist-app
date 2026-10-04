import { validateApiUrl } from './marketplaceUrl';

export class PendingStoreError extends Error {
  constructor() { super('無法安全保存或恢復待確認操作。請重試恢復；不會在未保存時送出。'); }
}
export type PendingStore = {
  get(key: string): Promise<string | null>;
  save(key: string, body: string): Promise<void>;
  clear(key: string, expectedBody: string): Promise<boolean>;
};
type Entry = { revision: string; iv: Uint8Array<ArrayBuffer>; cipher: ArrayBuffer };
const resource = /^(profile|avatar|feedback|email-diagnostics|api-integration|social-follow|legacy-list-operation|legacy-detail-operation|legacy-wish-photo|legacy-wish-photo-remove|listing|listing-management|listing-photo|listing-photo-remove|listing-draft|listing-compose-details|wish-create|wish-photo|wish-photo-remove|listing-report|(message|meetup|marketing|listing-edit|listing-compose|source-inquiry|source-cancel)\.[0-9a-f-]{36})$/i;
const keyPattern = /^(wishlist\.pending\.v1\.[a-f0-9]{64}\.[1-9][0-9]{0,9})\.(profile|avatar|feedback|email-diagnostics|api-integration|social-follow|legacy-list-operation|legacy-detail-operation|legacy-wish-photo|legacy-wish-photo-remove|listing|listing-management|listing-photo|listing-photo-remove|listing-draft|listing-compose-details|wish-create|wish-photo|wish-photo-remove|listing-report|(message|meetup|marketing|listing-edit|listing-compose|source-inquiry|source-cancel)\.[0-9a-f-]{36})$/;
export async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function pendingScope(apiUrl: string, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647) throw new PendingStoreError();
  // Production fetch uses the fixed same-origin '/api'. Resolve only that
  // application-owned value; arbitrary relative/server URLs stay forbidden.
  const absolute = apiUrl === '/api' && typeof window !== 'undefined'
    ? new URL('/api', window.location.origin).href : apiUrl;
  return `wishlist.pending.v1.${await sha256(validateApiUrl(absolute, import.meta.env.DEV))}.${userId}`;
}
export async function pendingRequestKey(apiUrl: string, userId: number, feature: string) {
  if (!resource.test(feature) && !/^listing-manual-(create|photo)$/.test(feature)) throw new PendingStoreError();
  return `${await pendingScope(apiUrl, userId)}.${feature.toLowerCase()}`;
}
/** Anonymous feedback is isolated from every signed-in account; no fake user ID. */
export async function feedbackPendingKey(apiUrl: string, userId: number | null) {
  if(userId!==null)return pendingRequestKey(apiUrl,userId,'feedback');
  const absolute=apiUrl==='/api'&&typeof window!=='undefined'?new URL('/api',window.location.origin).href:apiUrl;
  return `wishlist.pending.public.v1.${await sha256(validateApiUrl(absolute,import.meta.env.DEV))}.feedback`;
}
/** Public partner contact belongs to its original submission, never a login. */
export async function partnerInquiryPendingKey(apiUrl:string){
  const absolute=apiUrl==='/api'&&typeof window!=='undefined'?new URL('/api',window.location.origin).href:apiUrl;
  return `wishlist.pending.public.v1.${await sha256(validateApiUrl(absolute,import.meta.env.DEV))}.partner-inquiry`;
}
function scopeOf(key: string) {
  const publicFeedback=/^(wishlist\.pending\.public\.v1\.[a-f0-9]{64})\.(feedback|partner-inquiry)$/.exec(key);
  if(publicFeedback)return publicFeedback[1];
  const match = keyPattern.exec(key) ?? /^(wishlist\.pending\.v1\.[a-f0-9]{64}\.[1-9][0-9]{0,9})\.listing-manual-(create|photo)$/.exec(key);
  if (!match || Number(match[1].split('.').at(-1)) > 2147483647) throw new PendingStoreError();
  return match[1];
}
function validBody(body: string) {
  if (typeof body !== 'string' || !body.length || body.length > 16000 || new TextDecoder().decode(new TextEncoder().encode(body)) !== body) throw new PendingStoreError();
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(new PendingStoreError()); });
}
function completed(tx: IDBTransaction) {
  const result = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new PendingStoreError());
  });
  void result.catch(() => {}); return result;
}

/** Same-origin browser storage, not hardware Keychain or protection from XSS.
 * No plaintext fallback. Encryption key is non-extractable; account/API scopes,
 * authenticated encryption and transactional CAS prevent stale ACKs or another
 * tab from replacing/clearing a pending operation. Never store access tokens.
 */
export function createWebPendingStore(dbName = 'wishlist-private-pending-v1', factory = globalThis.indexedDB, crypt = globalThis.crypto) {
  return createEncryptedPendingStore(dbName,factory,crypt,scopeOf);
}
/** Only the deletion recovery vault uses this independent API scope. It must
 * survive normal owner-data erasure until receipt verification and final CAS
 * cleanup, because the original session is needed after account deletion. */
export async function deletionRecoveryKey(apiUrl:string){
  const absolute=apiUrl==='/api'&&typeof window!=='undefined'?new URL('/api',window.location.origin).href:apiUrl;
  return `wishlist.recovery.deletion.v1.${await sha256(validateApiUrl(absolute,import.meta.env.DEV))}.account-deletion`;
}
export function createDeletionRecoveryVault(dbName='wishlist-deletion-recovery-v1',factory=globalThis.indexedDB,crypt=globalThis.crypto):PendingStore{
  const store=createEncryptedPendingStore(dbName,factory,crypt,key=>{
    const match=/^(wishlist\.recovery\.deletion\.v1\.[a-f0-9]{64})\.account-deletion$/.exec(key);
    if(!match)throw new PendingStoreError();return match[1];
  });
  // Ordinary feature journals never gain permission to store session tokens.
  // This dedicated vault exposes no mutable draft or owner-erasure API.
  return {get:store.get,save:store.save,clear:store.clear};
}
function createEncryptedPendingStore(dbName:string,factory:IDBFactory,crypt:Crypto,scopeForKey:(key:string)=>string) {
  let connection: Promise<IDBDatabase> | undefined;
  const open = () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory || !crypt?.subtle) { reject(new PendingStoreError()); return; }
    const req = factory.open(dbName, 1);
    req.onupgradeneeded = () => { for (const name of ['keys', 'pending', 'erased']) req.result.createObjectStore(name); };
    req.onerror = req.onblocked = () => { connection = undefined; reject(new PendingStoreError()); };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
  }).catch(() => { connection = undefined; throw new PendingStoreError(); });
  async function read(key: string): Promise<{ entry: Entry | undefined; secret: CryptoKey | undefined; erased: boolean }> {
    const scope = scopeForKey(key), db = await open(), tx = db.transaction(['pending', 'keys', 'erased'], 'readonly'), done = completed(tx);
    const [entry, secret, erased] = await Promise.all([
      request(tx.objectStore('pending').get(key)), request(tx.objectStore('keys').get(scope)), request(tx.objectStore('erased').get(scope)),
    ]);
    await done; return { entry, secret, erased: !!erased };
  }
  async function secretFor(scope: string) {
    const generated = await crypt.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const db = await open(), tx = db.transaction(['keys', 'erased'], 'readwrite', { durability: 'strict' }), done = completed(tx);
    const store = tx.objectStore('keys');
    const [existing, erased] = await Promise.all([request(store.get(scope)), request(tx.objectStore('erased').get(scope))]);
    if (erased) { tx.abort(); await done; throw new PendingStoreError(); }
    if (!existing) store.put(generated, scope);
    await done; return (existing ?? generated) as CryptoKey;
  }
  async function decode(key: string, entry: Entry, secret?: CryptoKey) {
    if (!secret || secret.extractable || secret.algorithm.name !== 'AES-GCM' || typeof entry.revision !== 'string' || !ArrayBuffer.isView(entry.iv) || Object.prototype.toString.call(entry.iv) !== '[object Uint8Array]' || entry.iv.length !== 12) throw new PendingStoreError();
    const plain = await crypt.subtle.decrypt({ name: 'AES-GCM', iv: entry.iv, additionalData: new TextEncoder().encode(key) }, secret, entry.cipher);
    const body = new TextDecoder('utf-8', { fatal: true }).decode(plain); validBody(body); return body;
  }
  const wrap = async <T,>(operation: () => Promise<T>) => { try { return await operation(); } catch { throw new PendingStoreError(); } };
  const store: PendingStore = {
    get: key => wrap(async () => { const row = await read(key); return !row.entry || row.erased ? null : decode(key, row.entry, row.secret); }),
    save: (key, body) => wrap(async () => {
      validBody(body); const scope = scopeForKey(key), before = await read(key);
      if (before.erased) throw new PendingStoreError();
      if (before.entry && await decode(key, before.entry, before.secret) !== body) throw new PendingStoreError();
      const secret = before.secret ?? await secretFor(scope), iv = crypt.getRandomValues(new Uint8Array(12));
      const cipher = await crypt.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) }, secret, new TextEncoder().encode(body));
      const db = await open(), tx = db.transaction(['pending', 'keys', 'erased'], 'readwrite', { durability: 'strict' }), done = completed(tx);
      const table = tx.objectStore('pending');
      const [current, erased, storedSecret] = await Promise.all([request<Entry | undefined>(table.get(key)), request(tx.objectStore('erased').get(scope)), request(tx.objectStore('keys').get(scope))]);
      if (erased || !storedSecret || current?.revision !== before.entry?.revision) { tx.abort(); await done; throw new PendingStoreError(); }
      if (!current) table.put({ revision: crypt.randomUUID(), iv, cipher } satisfies Entry, key);
      await done;
    }),
    clear: (key, expectedBody) => wrap(async () => {
      validBody(expectedBody); const before = await read(key);
      if (!before.entry || before.erased) return false;
      if (await decode(key, before.entry, before.secret) !== expectedBody) return false;
      const db = await open(), tx = db.transaction('pending', 'readwrite', { durability: 'strict' }), done = completed(tx), table = tx.objectStore('pending');
      const current = await request<Entry | undefined>(table.get(key));
      const matched = current?.revision === before.entry.revision;
      if (matched) table.delete(key); await done; return matched;
    }),
  };
  return { ...store,
    // Transfer one reviewed conflict into its owned editable draft atomically.
    // Separate draft-save and journal-clear transactions can lose the proposal.
    handoffListingEdit: (operationKey: string, expectedOperation: string, draftKey: string, expectedDraft: string | null, draftBody: string) => wrap(async () => {
      validBody(expectedOperation); validBody(draftBody); if (expectedDraft !== null) validBody(expectedDraft);
      const scope = scopeForKey(operationKey);
      if (!operationKey.endsWith('.listing-management') || !/\.listing-edit\.[0-9a-f-]{36}$/.test(draftKey) || scopeForKey(draftKey) !== scope) throw new PendingStoreError();
      const [operation, draft] = await Promise.all([read(operationKey), read(draftKey)]);
      if (operation.erased || draft.erased || !operation.entry ||
          await decode(operationKey, operation.entry, operation.secret) !== expectedOperation ||
          (draft.entry ? await decode(draftKey, draft.entry, draft.secret) : null) !== expectedDraft) throw new PendingStoreError();
      const iv = crypt.getRandomValues(new Uint8Array(12));
      const cipher = await crypt.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(draftKey) }, operation.secret!, new TextEncoder().encode(draftBody));
      const db = await open(), tx = db.transaction(['pending', 'keys', 'erased'], 'readwrite', { durability: 'strict' }), done = completed(tx);
      const table = tx.objectStore('pending');
      const [currentOperation, currentDraft, erased, secret] = await Promise.all([
        request<Entry | undefined>(table.get(operationKey)), request<Entry | undefined>(table.get(draftKey)),
        request(tx.objectStore('erased').get(scope)), request(tx.objectStore('keys').get(scope)),
      ]);
      if (erased || !secret || currentOperation?.revision !== operation.entry.revision || currentDraft?.revision !== draft.entry?.revision) {
        tx.abort(); await done; throw new PendingStoreError();
      }
      table.put({ revision: crypt.randomUUID(), iv, cipher } satisfies Entry, draftKey);
      table.delete(operationKey);
      await done;
    }),
    clearComposerDraft: (key:string,body:string) => wrap(async()=>{
      if(!/\.listing-compose\.[0-9a-f-]{36}$/.test(key))throw new PendingStoreError();
      return store.clear(key,body);
    }),
    // Mutable unsent form drafts only. Pending server-operation evidence remains
    // immutable through save(); replacing a draft is one encrypted CAS transaction.
    replaceDraft: (key: string, expectedBody: string | null, body: string) => wrap(async () => {
      if (!/\.(listing-edit|listing-compose)\.[0-9a-f-]{36}$/.test(key) && !key.endsWith('.listing-compose-details')) throw new PendingStoreError();
      validBody(body); if (expectedBody !== null) validBody(expectedBody);
      const scope = scopeForKey(key), before = await read(key);
      if (before.erased || (before.entry ? await decode(key, before.entry, before.secret) : null) !== expectedBody) throw new PendingStoreError();
      const secret = before.secret ?? await secretFor(scope), iv = crypt.getRandomValues(new Uint8Array(12));
      const cipher = await crypt.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) }, secret, new TextEncoder().encode(body));
      const db = await open(), tx = db.transaction(['pending', 'keys', 'erased'], 'readwrite', { durability: 'strict' }), done = completed(tx);
      const table = tx.objectStore('pending');
      const [current, erased, storedSecret] = await Promise.all([request<Entry | undefined>(table.get(key)), request(tx.objectStore('erased').get(scope)), request(tx.objectStore('keys').get(scope))]);
      if (erased || !storedSecret || current?.revision !== before.entry?.revision) { tx.abort(); await done; throw new PendingStoreError(); }
      table.put({ revision: crypt.randomUUID(), iv, cipher } satisfies Entry, key); await done;
    }),
    // Metadata discovery is restricted to unsent composer drafts in this exact
    // account/API scope, including photos later attached/deleted on another device.
    composerDraftKeys: (scope: string) => wrap(async () => {
      scopeForKey(scope + '.listing');
      const db = await open(), tx = db.transaction(['pending','erased'],'readonly'), done = completed(tx);
      const [keys, erased] = await Promise.all([
        request(tx.objectStore('pending').getAllKeys(IDBKeyRange.bound(scope + '.listing-compose.', scope + '.listing-compose.\uffff'))),
        request(tx.objectStore('erased').get(scope)),
      ]);
      await done;
      if (erased) return [];
      return keys.map(String).filter(key=>keyPattern.test(key)&&/\.listing-compose\.[0-9a-f-]{36}$/.test(key));
    }),
    eraseScope: (scope: string) => wrap(async () => {
    // Only invoke after the server's authoritative ERASED receipt, never logout.
    scopeForKey(scope + '.listing');
    const db = await open(), tx = db.transaction(['pending', 'keys', 'erased'], 'readwrite', { durability: 'strict' }), done = completed(tx);
    tx.objectStore('erased').put(true, scope); tx.objectStore('keys').delete(scope);
    const rows = tx.objectStore('pending').openCursor(IDBKeyRange.bound(scope + '.', scope + '.\uffff'));
    rows.onsuccess = () => { if (rows.result) { rows.result.delete(); rows.result.continue(); } };
    await done;
  }) };
}
// IndexedDB opens lazily; browsers with unavailable/private storage fail closed.
export const privatePendingStore = createWebPendingStore();
export async function erasePrivatePendingData(apiUrl: string, userId: number) {
  await privatePendingStore.eraseScope(await pendingScope(apiUrl, userId));
}
