import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDeletionRecovery, clearErasedSession, restoreAfterDeletionCheck } from '../deletionRecovery';
import { encodeDeletionJournal, parseDeletionJournal, type DeletionAck } from '../accountDeletion';
import { encodeSession, SESSION_KEY } from '../session';
const base = 'https://owned.example.invalid', key = 'wishlist.deletion.v1.synthetic', token = 'synthetic.payload.signature', action = randomUUID();
const encoded = () => encodeDeletionJournal(base, 42, token, action);
const binding = () => parseDeletionJournal(encoded(), base);
const erased = (): Extract<DeletionAck, { state: 'ERASED' }> => ({ state: 'ERASED', accountDeleted: true, clientActionId: action, erasedAt: '2026-09-15T12:00:00.000Z', photoCleanupPending: 1, legacyCleanupPending: 2 });
const abandoned = (): Extract<DeletionAck, { state: 'ABANDONED' }> => ({ state: 'ABANDONED', accountDeleted: false, clientActionId: action, erasedAt: null, photoCleanupPending: 0, legacyCleanupPending: 0 });
function fixture() {
  const values = new Map<string, string>();
  const port = { get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { values.set(key, value); }), remove: vi.fn(async (key: string) => { values.delete(key); }) };
  return { values, port, recovery: createDeletionRecovery(port, key, base) };
}
describe('single encrypted owner-bound deletion journal and monotonic proof', () => {
  it('returns no recovery when no record exists', async () => { const { recovery } = fixture(); expect(await recovery.read()).toBeNull(); });
  it('saves only the binding and optional proof in one bounded record, no password or chunks', async () => {
    const { values, recovery } = fixture(); await recovery.save(encoded());
    expect(values.size).toBe(1); expect(values.get(key)!.length).toBeLessThanOrEqual(1900);
    expect(JSON.parse(values.get(key)!)).toEqual({ version: 1, journal: binding(), proof: null });
    expect(values.get(key)).not.toMatch(/password|phone|address/); expect(await recovery.read()).toEqual(binding()); expect(await recovery.readProof(binding())).toBeNull();
  });
  it('does not clear an unconfirmed operation based on a missing acknowledgement', async () => {
    const { port, recovery } = fixture(); await recovery.save(encoded());
    await expect(recovery.clear(binding())).rejects.toThrow(); expect(port.remove).not.toHaveBeenCalled();
  });
  it('preserves acknowledged proof after restarting JS, independently of later JWT expiry', async () => {
    const { port, recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), erased());
    const restarted = createDeletionRecovery(port, key, base);
    expect(await restarted.read()).toEqual(binding()); expect(await restarted.readProof(binding())).toEqual(erased());
    await restarted.save(encoded()); expect(await restarted.readProof(binding())).toEqual(erased());
  });
  it('updates cleanup counts without downgrading the same proven outcome', async () => {
    const { recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), erased());
    await recovery.saveProof(binding(), { ...erased(), photoCleanupPending: 0, legacyCleanupPending: 0 });
    expect(await recovery.readProof(binding())).toMatchObject({ state: 'ERASED', photoCleanupPending: 0 });
    await expect(recovery.saveProof(binding(), abandoned())).rejects.toThrow();
    await expect(recovery.saveProof(binding(), { ...erased(), erasedAt: '2026-09-15T12:01:00.000Z' })).rejects.toThrow();
    expect(await recovery.readProof(binding())).toMatchObject({ state: 'ERASED', photoCleanupPending: 0 });
  });
  it.each([erased(), abandoned()])('clears only an exact operation with proven state $state', async proof => {
    const { values, recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), proof);
    await recovery.clear(binding()); await recovery.clear(binding()); expect(values.has(key)).toBe(false);
  });
  it.each([{ userId: 43 }, { clientActionId: randomUUID() }, { originalToken: 'another.payload.signature' }, { apiBase: 'https://other.example.invalid' }])('refuses old/cross-account actions %j', async change => {
    const { port, recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), erased());
    const foreign = { ...binding(), ...change };
    await expect(recovery.readProof(foreign)).rejects.toThrow(); await expect(recovery.saveProof(foreign, erased())).rejects.toThrow(); await expect(recovery.clear(foreign)).rejects.toThrow(); expect(port.remove).not.toHaveBeenCalled();
  });
  it('serializes different callers so competing unconfirmed operations cannot overwrite each other', async () => {
    const { port, recovery } = fixture(); const other = createDeletionRecovery(port, key, base);
    const results = await Promise.allSettled([recovery.save(encoded()), other.save(encodeDeletionJournal(base, 43, token, randomUUID()))]);
    expect(results.map(value => value.status)).toEqual(['fulfilled', 'rejected']); expect(await recovery.read()).toEqual(binding());
  });
  it('recovers an ambiguous native save that actually committed', async () => {
    const { values, port, recovery } = fixture(); port.set.mockImplementationOnce(async (name, value) => { values.set(name, value); throw new Error('ambiguous save'); });
    await recovery.save(encoded()); expect(await recovery.read()).toEqual(binding());
  });
  it('does not report saving when a native write failed before commit', async () => {
    const { port, recovery } = fixture(); port.set.mockRejectedValueOnce(new Error('save unavailable'));
    await expect(recovery.save(encoded())).rejects.toThrow(); expect(await recovery.read()).toBeNull();
  });
  it('recovers a committed acknowledgement save despite an ambiguous native reply', async () => {
    const { values, port, recovery } = fixture(); await recovery.save(encoded());
    port.set.mockImplementationOnce(async (name, value) => { values.set(name, value); throw new Error('ambiguous proof'); });
    await recovery.saveProof(binding(), erased()); expect(await recovery.readProof(binding())).toEqual(erased());
  });
  it('keeps the original operation when proof persistence fails before commit', async () => {
    const { port, recovery } = fixture(); await recovery.save(encoded()); port.set.mockRejectedValueOnce(new Error('proof unavailable'));
    await expect(recovery.saveProof(binding(), erased())).rejects.toThrow(); expect(await recovery.readProof(binding())).toBeNull(); expect(await recovery.read()).toEqual(binding());
  });
  it('keeps proof after a failed cleanup and removes it atomically with the JWT only on retry', async () => {
    const { port, recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), erased()); port.remove.mockRejectedValueOnce(new Error('clear unavailable'));
    await expect(recovery.clear(binding())).rejects.toThrow(); expect(await createDeletionRecovery(port, key, base).readProof(binding())).toEqual(erased());
    await recovery.clear(binding()); expect(await recovery.read()).toBeNull();
  });
  it('accepts an ambiguous native clear only after observing the record absent', async () => {
    const { values, port, recovery } = fixture(); await recovery.save(encoded()); await recovery.saveProof(binding(), erased());
    port.remove.mockImplementationOnce(async name => { values.delete(name); throw new Error('ambiguous clear'); });
    await recovery.clear(binding()); expect(await recovery.read()).toBeNull();
  });
  it('reserves the largest acknowledgement budget before any native write or deletion', async () => {
    const { port, recovery } = fixture(); const large = encodeDeletionJournal(base, 42, 'a'.repeat(1650) + '.payload.signature', action);
    await expect(recovery.save(large)).rejects.toThrow(); expect(port.set).not.toHaveBeenCalled();
  });
  it.each(['bad-json', '{}', 'x'.repeat(1901), JSON.stringify({ version: 2, journal: binding(), proof: null }), JSON.stringify({ version: 1, journal: { ...binding(), password: 'synthetic' }, proof: null }), JSON.stringify({ version: 1, journal: binding(), proof: { ...erased(), clientActionId: randomUUID() } })])('rejects damaged recovery without clearing it %s', async invalid => {
    const { values, port, recovery } = fixture(); values.set(key, invalid);
    await expect(recovery.read()).rejects.toThrow(); expect(values.get(key)).toBe(invalid); expect(port.remove).not.toHaveBeenCalled();
  });
  it('does not forward or clear another service recovery record', async () => {
    const { port, recovery } = fixture(); await recovery.save(encoded());
    await expect(createDeletionRecovery(port, key, 'https://other.example.invalid').read()).rejects.toThrow();
    expect(await recovery.read()).toEqual(binding());
  });
});
describe('boot ordering and exact-owner session cleanup', () => {
  it('never touches normal session or profile HTTP while a recovery operation exists', async () => {
    const restore = vi.fn(); expect(await restoreAfterDeletionCheck(async () => binding(), restore)).toEqual({ kind: 'deletion', journal: binding() }); expect(restore).not.toHaveBeenCalled();
  });
  it('never removes a stale ordinary JWT while recovery storage is unavailable', async () => {
    const restore = vi.fn(); expect(await restoreAfterDeletionCheck(async () => { throw new Error('locked keychain'); }, restore)).toEqual({ kind: 'deletion-storage-unavailable' }); expect(restore).not.toHaveBeenCalled();
  });
  it('restores the normal session only after verifying no recovery record exists', async () => {
    const events: string[] = []; expect(await restoreAfterDeletionCheck(async () => { events.push('recovery'); return null; }, async () => { events.push('restore'); return 'synthetic'; })).toEqual({ kind: 'session', session: 'synthetic' }); expect(events).toEqual(['recovery', 'restore']);
  });
  it('clears only the exact original session while leaving the deletion journal intact', async () => {
    const { values, port, recovery } = fixture(); await recovery.save(encoded()); values.set(SESSION_KEY, encodeSession(base, token));
    await clearErasedSession(port, binding()); expect(values.has(SESSION_KEY)).toBe(false); expect(await recovery.read()).toEqual(binding());
  });
  it.each([encodeSession(base, 'later.payload.signature'), encodeSession('https://other.example.invalid', token)])('preserves a later account or service session %s', async session => {
    const { values, port } = fixture(); values.set(SESSION_KEY, session); await clearErasedSession(port, binding()); expect(values.get(SESSION_KEY)).toBe(session); expect(port.remove).not.toHaveBeenCalled();
  });
  it('treats an already absent session as clean', async () => { const { port } = fixture(); await clearErasedSession(port, binding()); expect(port.remove).not.toHaveBeenCalled(); });
  it('does not claim cleanup after a native deletion fails', async () => {
    const { values, port } = fixture(); values.set(SESSION_KEY, encodeSession(base, token)); port.remove.mockRejectedValueOnce(new Error('session unavailable'));
    await expect(clearErasedSession(port, binding())).rejects.toThrow(); expect(values.has(SESSION_KEY)).toBe(true);
  });
  it('accepts lost cleanup ACK only when the exact session is observed absent', async () => {
    const { values, port } = fixture(); values.set(SESSION_KEY, encodeSession(base, token));
    port.remove.mockImplementationOnce(async name => { values.delete(name); throw new Error('ambiguous session delete'); });
    await clearErasedSession(port, binding()); expect(values.has(SESSION_KEY)).toBe(false);
  });
  it.each(['null', '[]', '{}', '{'])('does not blindly delete an unknown or damaged session %s', async session => {
    const { values, port } = fixture(); values.set(SESSION_KEY, session); await expect(clearErasedSession(port, binding())).rejects.toThrow(); expect(values.get(SESSION_KEY)).toBe(session); expect(port.remove).not.toHaveBeenCalled();
  });
});
