/// <reference types="node" />
import { webcrypto, randomUUID } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebPendingStore, pendingRequestKey, feedbackPendingKey, PendingStoreError } from './webPendingStore';
const scope = `wishlist.pending.v1.${'a'.repeat(64)}.42`, key = scope + '.listing-report';
const crypt = webcrypto as unknown as Crypto;
function fixture() { const factory = new IDBFactory(), name = randomUUID(); return { factory, name, store: createWebPendingStore(name, factory, crypt) }; }
async function raw(factory: IDBFactory, name: string, table: string, key: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = factory.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return new Promise<unknown>((resolve, reject) => { const r = db.transaction(table).objectStore(table).get(key); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => { reject(r.error); db.close(); }; });
}
beforeEach(() => { vi.stubGlobal('crypto', crypt); vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
afterEach(()=>vi.unstubAllGlobals());
describe('browser encrypted pending operations', () => {
  it('isolates anonymous feedback by API from all owners, encrypts contact text and restricts public keys to feedback',async()=>{
    const {store,factory,name}=fixture(),a=await feedbackPendingKey('https://example.com/api',null),b=await feedbackPendingKey('https://other.example/api',null),own=await feedbackPendingKey('https://example.com/api',42);
    const body=JSON.stringify({content:'synthetic-private-feedback',email:'fixture@example.invalid'});await store.save(a,body);
    expect(await createWebPendingStore(name,factory,crypt).get(a)).toBe(body);expect(await store.get(b)).toBeNull();expect(await store.get(own)).toBeNull();
    const row=await raw(factory,name,'pending',a) as {cipher:ArrayBuffer};expect(new TextDecoder().decode(row.cipher)).not.toMatch(/synthetic-private-feedback|fixture@example/);
    const secret=await raw(factory,name,'keys',a.slice(0,-9)) as CryptoKey;expect(secret.extractable).toBe(false);
    await expect(store.save(a.replace(/feedback$/,'profile'),'invalid')).rejects.toThrow();await expect(store.eraseScope(a.slice(0,-9))).rejects.toThrow();
    expect(await store.clear(a,'another')).toBe(false);expect(await store.clear(a,body)).toBe(true);await store.save(a,'newer');expect(await store.clear(a,body)).toBe(false);expect(await store.get(a)).toBe('newer');
  });
  it('erases signed-in feedback with its confirmed owner scope, leaving anonymous and other owners untouched',async()=>{
    const {store,factory,name}=fixture(),own=await feedbackPendingKey('https://example.com/api',42),other=await feedbackPendingKey('https://example.com/api',43),anonymous=await feedbackPendingKey('https://example.com/api',null);
    for(const key of [own,other,anonymous])await store.save(key,'original');await store.eraseScope(own.slice(0,-9));
    expect(await store.get(own)).toBeNull();expect(await store.get(other)).toBe('original');expect(await store.get(anonymous)).toBe('original');await expect(createWebPendingStore(name,factory,crypt).save(own,'late')).rejects.toThrow();
  });
  it.each(['legacy-list-operation','legacy-detail-operation'])('restores encrypted %s markers with unique local identity, CAS and account/API isolation', async feature => {
    const {factory,name,store}=fixture();
    const a=await pendingRequestKey('https://example.com/api',42,feature),b=await pendingRequestKey('https://example.com/api',43,feature),c=await pendingRequestKey('https://other.example/api',42,feature);
    const original=JSON.stringify({version:1,id:7,kind:'PRIVACY',wanted:true,localOperationId:randomUUID()}),later=JSON.stringify({version:1,id:7,kind:'PRIVACY',wanted:true,localOperationId:randomUUID()});
    await store.save(a,original);expect(await createWebPendingStore(name,factory,crypt).get(a)).toBe(original);expect(await store.get(b)).toBeNull();expect(await store.get(c)).toBeNull();
    expect(new TextDecoder().decode((await raw(factory,name,'pending',a) as {cipher:ArrayBuffer}).cipher)).not.toContain('localOperationId');
    await expect(store.save(a,later)).rejects.toThrow();expect(await store.clear(a,original)).toBe(true);await store.save(a,later);expect(await store.clear(a,original)).toBe(false);expect(await store.get(a)).toBe(later);
    await store.eraseScope(a.slice(0,-feature.length-1));await expect(store.save(a,original)).rejects.toThrow();expect(await store.get(a)).toBeNull();
  });
  it('discovers only this account and API composer drafts and preserves immutable server journals',async()=>{
    const {store}=fixture(),id='11111111-1111-4111-8111-111111111111',compose=scope+'.listing-compose.'+id,details=scope+'.listing-compose-details',other=scope.replace('.42','.43')+'.listing-compose.'+id;
    await store.replaceDraft(compose,null,'private-unsent-text');await store.replaceDraft(details,null,'approximate-local-settings');await store.replaceDraft(other,null,'other-account');await store.save(scope+'.listing-draft','immutable-server-operation');
    expect(await store.composerDraftKeys(scope)).toEqual([compose]);await expect(store.replaceDraft(scope+'.listing-draft','immutable-server-operation','replacement')).rejects.toThrow();await expect(store.clearComposerDraft(scope+'.listing-draft','immutable-server-operation')).rejects.toThrow();
    await store.eraseScope(scope);expect(await store.composerDraftKeys(scope)).toEqual([]);expect(await store.get(details)).toBeNull();expect(await store.get(other)).toBe('other-account');await expect(store.replaceDraft(compose,null,'late')).rejects.toThrow();
  });
  it('persists owner management separately from creates and refuses cross-account/API replacement',async()=>{
    const {factory,name,store}=fixture(),a=await pendingRequestKey('https://example.com/api',42,'listing-management'),b=await pendingRequestKey('https://example.com/api',43,'listing-management'),c=await pendingRequestKey('https://other.example/api',42,'listing-management');
    await store.save(a,'private-original-edit');await store.save(scope+'.listing','unrelated-create');
    expect(await createWebPendingStore(name,factory,crypt).get(a)).toBe('private-original-edit');expect(await store.get(b)).toBeNull();expect(await store.get(c)).toBeNull();
    await expect(store.save(a,'other-edit')).rejects.toThrow();expect(await store.clear(a,'other-edit')).toBe(false);expect(await store.clear(a,'private-original-edit')).toBe(true);expect(await store.get(scope+'.listing')).toBe('unrelated-create');
  });
  it('replaces only the exact mutable edit draft, encrypted and scoped to a listing', async () => {
    const { factory, name, store } = fixture(), draftKey = scope + '.listing-edit.11111111-1111-4111-8111-111111111111';
    await store.replaceDraft(draftKey, null, 'unsent-one');
    await store.replaceDraft(draftKey, 'unsent-one', 'unsent-two');
    await expect(store.replaceDraft(draftKey, 'unsent-one', 'stale-overwrite')).rejects.toThrow(PendingStoreError);
    await expect(store.replaceDraft(key, null, 'mutable-receipt')).rejects.toThrow(PendingStoreError);
    expect(await createWebPendingStore(name, factory, crypt).get(draftKey)).toBe('unsent-two');
    expect(new TextDecoder().decode((await raw(factory,name,'pending',draftKey) as {cipher:ArrayBuffer}).cipher)).not.toContain('unsent-two');
    await store.eraseScope(scope);
    await expect(store.replaceDraft(draftKey, null, 'late')).rejects.toThrow(PendingStoreError);
  });
  it('allows only one tab to replace a draft read from the same revision', async () => {
    const { factory, name, store } = fixture(), other = createWebPendingStore(name, factory, crypt), draftKey = scope + '.listing-edit.11111111-1111-4111-8111-111111111111';
    await store.replaceDraft(draftKey, null, 'original');
    const results = await Promise.allSettled([store.replaceDraft(draftKey, 'original', 'a'), other.replaceDraft(draftKey, 'original', 'b')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.get(draftKey)).toMatch(/^[ab]$/);
    expect(await store.clear(draftKey, 'original')).toBe(false);
  });
  it('resolves the real production same-origin API without accepting arbitrary relative URLs',async()=>{
    vi.stubGlobal('window',{location:{origin:'https://wishlist-app-production.up.railway.app'}});
    expect(await pendingRequestKey('/api',42,'listing-draft')).toBe(await pendingRequestKey('https://wishlist-app-production.up.railway.app/api',42,'listing-draft'));
    const a=await pendingRequestKey('/api',42,'marketing.11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('window',{location:{origin:'https://other.example.com'}});expect(a).not.toBe(await pendingRequestKey('/api',42,'marketing.11111111-1111-4111-8111-111111111111'));
    await expect(pendingRequestKey('//evil.example/api',42,'listing-draft')).rejects.toThrow();await expect(pendingRequestKey('../api',42,'listing-draft')).rejects.toThrow();
  });
  it('isolates marketing queue proof by source, API and account, preserving ciphertext across reload',async()=>{
    const {factory,name,store}=fixture(),source='11111111-1111-4111-8111-111111111111',a=await pendingRequestKey('https://example.com/api',42,'marketing.'+source),b=await pendingRequestKey('https://example.com/api',43,'marketing.'+source),c=await pendingRequestKey('https://other.example.com/api',42,'marketing.'+source);
    await store.save(a,'private-revision-prompt');expect(await store.get(b)).toBeNull();expect(await store.get(c)).toBeNull();expect(await createWebPendingStore(name,factory,crypt).get(a)).toBe('private-revision-prompt');
    expect(new TextDecoder().decode((await raw(factory,name,'pending',a)as{cipher:ArrayBuffer}).cipher)).not.toContain('private-revision-prompt');
  });
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
  it('encrypts and fences photo removal journals separately from newer uploads and other owners', async () => {
    const { store } = fixture(), removal = scope + '.wish-photo-remove', photo = scope + '.wish-photo';
    const other = scope.replace('.42', '.43') + '.wish-photo-remove';
    await store.save(removal, 'original-removal'); await store.save(photo, 'new-photo'); await store.save(other, 'other-removal');
    expect(await store.clear(removal, 'different')).toBe(false);
    expect(await store.clear(removal, 'original-removal')).toBe(true);
    expect(await store.get(photo)).toBe('new-photo'); expect(await store.get(other)).toBe('other-removal');
    await store.eraseScope(scope); await expect(store.save(removal, 'late')).rejects.toThrow(PendingStoreError);
    expect(await store.get(other)).toBe('other-removal');
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
