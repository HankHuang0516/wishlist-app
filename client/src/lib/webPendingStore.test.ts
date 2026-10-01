/// <reference types="node" />
import { webcrypto, randomUUID } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebPendingStore, pendingRequestKey, PendingStoreError } from './webPendingStore';
const scope = `wishlist.pending.v1.${'a'.repeat(64)}.42`, key = scope + '.listing-report';
const crypt = webcrypto as unknown as Crypto;
function fixture() { const factory = new IDBFactory(), name = randomUUID(); return { factory, name, store: createWebPendingStore(name, factory, crypt) }; }
async function raw(factory: IDBFactory, name: string, table: string, key: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = factory.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return new Promise<unknown>((resolve, reject) => { const r = db.transaction(table).objectStore(table).get(key); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => { reject(r.error); db.close(); }; });
}
beforeEach(() => { vi.stubGlobal('crypto', crypt); vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
describe('browser encrypted pending operations', () => {
  it('persists encrypted evidence and a non-extractable key, restoring after reload', async () => {
    const { factory, name, store } = fixture(), body = JSON.stringify({ privateEvidence: '合成私密證據🦉' });
    await store.save(key, body); expect(await store.get(key)).toBe(body);
    const row = await raw(factory, name, 'pending', key) as { cipher: ArrayBuffer; iv: Uint8Array; revision: string };
    expect(new TextDecoder().decode(row.cipher)).not.toContain('合成私密證據'); expect(row.iv.length).toBe(12);
    const secret = await raw(factory, name, 'keys', scope) as CryptoKey;
    expect(secret.extractable).toBe(false); await expect(crypt.subtle.exportKey('raw', secret)).rejects.toThrow();
    expect(await createWebPendingStore(name, factory, crypt).get(key)).toBe(body);
  });
  it('keeps an identical request idempotent and rejects replacing pending evidence', async () => {
    const { store } = fixture(); await store.save(key, 'original'); await store.save(key, 'original');
    await expect(store.save(key, 'replacement')).rejects.toThrow(PendingStoreError); expect(await store.get(key)).toBe('original');
  });
  it('separates an encrypted wish photo journal from its wish create operation and honors explicit scope erasure', async () => {
    const { store } = fixture(), photo = scope + '.wish-photo', create = scope + '.wish-create';
    await store.save(photo, 'upload-identity-and-digest'); await store.save(create, 'exact-create-body');
    expect(await store.get(photo)).toBe('upload-identity-and-digest');
    expect(await store.clear(create, 'exact-create-body')).toBe(true);
    expect(await store.get(photo)).toBe('upload-identity-and-digest');
    await store.eraseScope(scope); expect(await store.get(photo)).toBeNull();
    await expect(store.save(photo, 'late-upload')).rejects.toThrow(PendingStoreError);
  });
  it('only clears the exact acknowledged body and never another resource/account', async () => {
    const { store } = fixture(), other = scope.replace('.42', '.43') + '.listing-report';
    await store.save(key, 'new'); await store.save(other, 'other');
    expect(await store.clear(key, 'old')).toBe(false); expect(await store.get(key)).toBe('new');
    expect(await store.clear(key, 'new')).toBe(true); expect(await store.clear(key, 'new')).toBe(false); expect(await store.get(other)).toBe('other');
  });
  it('serializes two tabs racing to publish different journals, without overwrite', async () => {
    const { store, factory, name } = fixture(), other = createWebPendingStore(name, factory, crypt);
    const results = await Promise.allSettled([store.save(key, 'a'), other.save(key, 'b')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.get(key)).toMatch(/^[ab]$/); expect(await other.get(key)).toBe(await store.get(key));
  });
  it('cryptographically binds ciphertext to its account/resource key', async () => {
    const { factory, name, store } = fixture(); await store.save(key, 'private');
    const db = await new Promise<IDBDatabase>(resolve => { const r = factory.open(name); r.onsuccess = () => resolve(r.result); });
    const row = await raw(factory, name, 'pending', key), wrong = scope + '.wish-create';
    await new Promise<void>(resolve => { const tx = db.transaction('pending', 'readwrite'); tx.objectStore('pending').put(row, wrong); tx.oncomplete = () => resolve(); });
    await expect(store.get(wrong)).rejects.toThrow(PendingStoreError); expect(await store.get(key)).toBe('private'); db.close();
  });
  it('erases only the acknowledged account and permanently fences late writes after restart', async () => {
    const { factory, name, store } = fixture(), other = scope.replace('.42', '.43') + '.listing-report';
    await store.save(key, 'private'); await store.save(scope + '.wish-create', 'wish'); await store.save(other, 'other');
    await store.eraseScope(scope); expect(await store.get(key)).toBeNull(); expect(await raw(factory, name, 'keys', scope)).toBeUndefined();
    expect(await store.get(other)).toBe('other');
    const restarted = createWebPendingStore(name, factory, crypt); await expect(restarted.save(key, 'late')).rejects.toThrow(PendingStoreError); expect(await restarted.get(key)).toBeNull();
  });
  it.each(['', 'x'.repeat(16001), '\ud800', '\udc00'])('fails closed for invalid or oversized body %#', async body => {
    const { store } = fixture(); await expect(store.save(key, body)).rejects.toThrow(PendingStoreError); expect(await store.get(key)).toBeNull();
  });
  it.each(['', '../unsafe', scope + '.message.invalid', scope.replace('.42', '.2147483648') + '.listing'])('rejects unsafe storage keys %#', async key => {
    const { store } = fixture(); await expect(store.save(key, 'valid')).rejects.toThrow(PendingStoreError);
  });
  it('requires real IndexedDB and WebCrypto; never falls back to plaintext localStorage', async () => {
    const store = createWebPendingStore('missing', undefined, {} as Crypto);
    await expect(store.save(key, 'evidence')).rejects.toThrow(PendingStoreError);
  });
  it('scopes operations to a trusted API, account and feature, not token rotation', async () => {
    const a = await pendingRequestKey('https://example.com/api', 42, 'listing-report');
    expect(a).toBe(await pendingRequestKey('https://example.com', 42, 'listing-report'));
    expect(a).not.toBe(await pendingRequestKey('https://other.example.com', 42, 'listing-report'));
    expect(a).not.toBe(await pendingRequestKey('https://example.com', 43, 'listing-report'));
    await expect(pendingRequestKey('https://evil:password@example.com', 42, 'listing-report')).rejects.toThrow();
    await expect(pendingRequestKey('https://example.com', 42, '../secret')).rejects.toThrow();
  });
});
