/// <reference types="node" />
import { webcrypto, randomUUID } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebPendingStore, pendingRequestKey } from './webPendingStore';
import { DiagnosticsConflict, DiagnosticsRejected, dispatchEmailDiagnostic, parseDiagnosticsMarker, readDiagnosticsCapability } from './emailDiagnosticsWeb';
const marker = { version: 1, localOperationId: '11111111-1111-4111-8111-111111111111', startedAt: '2026-10-02T00:00:00.000Z' };
const crypt = webcrypto as unknown as Crypto;
beforeEach(() => { vi.stubGlobal('crypto', crypt); vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(['{bad', '{}', JSON.stringify({ ...marker, token: 'private-session' }), JSON.stringify({ ...marker, version: 2 }), JSON.stringify({ ...marker, startedAt: '2026-02-30T00:00:00.000Z' }), JSON.stringify({ ...marker, localOperationId: 'invalid' })])('rejects corrupt or overposted markers without a plaintext fallback %#', raw => expect(() => parseDiagnosticsMarker(raw)).toThrow());
it('encrypts and restores only the original account/API diagnostic marker with immutable CAS and confirmed erasure fencing', async () => {
  const factory = new IDBFactory(), name = randomUUID(), store = createWebPendingStore(name, factory, crypt);
  const key = await pendingRequestKey('https://example.com/api', 42, 'email-diagnostics'), raw = JSON.stringify(marker);
  await store.save(key, raw); expect(await createWebPendingStore(name, factory, crypt).get(key)).toBe(raw);
  expect(await store.get(await pendingRequestKey('https://example.com/api', 43, 'email-diagnostics'))).toBeNull();
  expect(await store.get(await pendingRequestKey('https://other.example/api', 42, 'email-diagnostics'))).toBeNull();
  expect(await store.get(await pendingRequestKey('https://example.com/api', 42, 'feedback'))).toBeNull();
  const db = await new Promise<IDBDatabase>(resolve => { const req = factory.open(name); req.onsuccess = () => resolve(req.result); });
  const row = await new Promise<{ cipher: ArrayBuffer }>(resolve => { const req = db.transaction('pending').objectStore('pending').get(key); req.onsuccess = () => resolve(req.result); }); db.close();
  expect(new TextDecoder().decode(row.cipher)).not.toContain('localOperationId');
  const other = JSON.stringify({ ...marker, localOperationId: randomUUID() }); await expect(store.save(key, other)).rejects.toThrow(); expect(await store.clear(key, other)).toBe(false);
  expect(await store.clear(key, raw)).toBe(true); await store.save(key, other); expect(await store.clear(key, raw)).toBe(false);
  await store.eraseScope(key.slice(0, -18)); expect(await store.get(key)).toBeNull(); await expect(store.save(key, raw)).rejects.toThrow();
});
it('reads only a matching private capability without trusting extra role or recipient fields', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ userId: 42, canSend: true }) })); vi.stubGlobal('fetch', fetcher);
  expect(await readDiagnosticsCapability('/api', 'synthetic-session', 42)).toBe(true);
  expect(fetcher.mock.calls[0]).toEqual(['/api/feedback/test', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer synthetic-session' }, cache: 'no-store', redirect: 'error' })]);
  fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ userId: 43, canSend: true }) }); await expect(readDiagnosticsCapability('/api', 'synthetic-session', 42)).rejects.toThrow();
});
it('blocks dispatch after a competing journal or departure and posts no credential/body beyond the live bearer', async () => {
  const raw = JSON.stringify(marker), get = vi.fn(async () => 'other-operation'), store = { get, save: vi.fn(), clear: vi.fn() };
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({ success: true, notificationStatus: 'ACCEPTED' }) })); vi.stubGlobal('fetch', fetcher);
  await expect(dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => true, store)).rejects.toThrow(DiagnosticsConflict); expect(fetcher).not.toHaveBeenCalled();
  get.mockResolvedValue(raw); await expect(dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => false, store)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  await dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => true, store);
  expect(fetcher.mock.calls[0]).toEqual(['/api/feedback/test', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer synthetic-session' }, cache: 'no-store', redirect: 'error' })]); expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
});
it.each([{ success: true, log: 'private-diagnostic', id: 'provider-id' }, { success: true }, { success: true, notificationStatus: 'DELIVERED' }])('does not turn an old or malformed ACK into acceptance %#', async body => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
  const raw = JSON.stringify(marker), store = { get: vi.fn(async () => raw), save: vi.fn(), clear: vi.fn() };
  await expect(dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => true, store)).rejects.toThrow(); expect(store.clear).not.toHaveBeenCalled();
});
it('distinguishes explicit server refusal from an unknown provider reply', async () => {
  const fetcher = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ errorCode: 'EMAIL_DIAGNOSTICS_DENIED' }) })); vi.stubGlobal('fetch', fetcher);
  const raw = JSON.stringify(marker), store = { get: vi.fn(async () => raw), save: vi.fn(), clear: vi.fn() };
  await expect(dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => true, store)).rejects.toThrow(DiagnosticsRejected);
  fetcher.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ errorCode: 'EMAIL_DIAGNOSTICS_UNCONFIRMED' }) });
  await expect(dispatchEmailDiagnostic('/api', 'synthetic-session', 'key', raw, () => true, store)).rejects.not.toThrow(DiagnosticsRejected);
});
