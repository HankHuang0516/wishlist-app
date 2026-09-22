import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../api';
import { abandonDeletion, DELETION_IMPACT_LABELS, encodeDeletionJournal, lookupDeletion, parseDeletionAck, parseDeletionImpact, parseDeletionJournal, prepareDeletion, retainDeletionResult, submitDeletion } from '../accountDeletion';
import { SecurityApi } from '../accountSecurity';
const base = 'https://owned.example.invalid', action = randomUUID(), token = 'synthetic.payload.signature';
const ack = () => ({ state: 'ERASED', accountDeleted: true, clientActionId: action, erasedAt: '2026-09-15T11:45:00.000Z', photoCleanupPending: 1, legacyCleanupPending: 2 });
const cancelled = () => ({ state: 'ABANDONED', accountDeleted: false, clientActionId: action, erasedAt: null, photoCleanupPending: 0, legacyCleanupPending: 0 });
const journal = () => encodeDeletionJournal(base, 1, token, action);
describe('readonly impact boundaries and proven-outcome monotonicity', () => {
  const preview = () => ({ version: 2, previewOnly: true, accountDeleted: false, capturedAt: ack().erasedAt, counts: Object.fromEntries(Object.keys(DELETION_IMPACT_LABELS).map(key => [key, 0])) });
  it('accepts all twenty-three valid counts without pretending account deletion', () => { expect(Object.keys(parseDeletionImpact(preview()).counts)).toHaveLength(23); });
  it.each([{ version: 1 }, { previewOnly: false }, { accountDeleted: true }, { capturedAt: 'invalid' }, { counts: {} }, { counts: [] }])('refuses invalid or incomplete preview %j', change => expect(() => parseDeletionImpact({ ...preview(), ...change })).toThrow());
  it.each([-1, 1.1, '1', 2147483648])('refuses invalid preview count %s', count => expect(() => parseDeletionImpact({ ...preview(), counts: { ...preview().counts, wishes: count } })).toThrow());
  it('refuses unexpected expanded count fields', () => expect(() => parseDeletionImpact({ ...preview(), counts: { ...preview().counts, password: 0 } })).toThrow());
  it('accepts a first proof, including replacing an earlier unknown result', () => { const incoming = { kind: 'erased' as const, ack: parseDeletionAck(ack(), action) }; expect(retainDeletionResult(null, incoming)).toEqual(incoming); expect(retainDeletionResult({ kind: 'unconfirmed', message: 'unknown' }, incoming)).toEqual(incoming); });
  it.each(['erased', 'abandoned'] as const)('never downgrades proven %s because a later lookup expired or failed', kind => { const previous = { kind, ack: parseDeletionAck(kind === 'erased' ? ack() : cancelled(), action) }; expect(retainDeletionResult(previous, { kind: 'unconfirmed', message: 'expired' })).toBe(previous); });
  it('rejects contradictory later state or erasure time for the same operation', () => { const previous = { kind: 'erased' as const, ack: parseDeletionAck(ack(), action) }; expect(() => retainDeletionResult(previous, { kind: 'abandoned', ack: parseDeletionAck(cancelled(), action) })).toThrow(); expect(() => retainDeletionResult(previous, { kind: 'erased', ack: parseDeletionAck({ ...ack(), erasedAt: '2026-09-15T11:46:00.000Z' }, action) })).toThrow(); });
  it('allows refreshed cleanup counts for the same immutable proof', () => { const previous = { kind: 'erased' as const, ack: parseDeletionAck(ack(), action) }, next = { kind: 'erased' as const, ack: parseDeletionAck({ ...ack(), photoCleanupPending: 0 }, action) }; expect(retainDeletionResult(previous, next)).toEqual(next); });
});
describe('origin-bound encrypted deletion recovery record', () => {
  it('contains only the original recovery binding, never password or profile data', () => {
    expect(JSON.parse(journal())).toEqual({ version: 1, apiBase: base, userId: 1, originalToken: token, clientActionId: action });
    expect(journal()).not.toMatch(/password|phone|address/);
    expect(parseDeletionJournal(journal(), base + '/api').userId).toBe(1);
  });
  it.each([{ version: 2 }, { userId: 0 }, { userId: 1.5 }, { userId: 2147483648 }, { clientActionId: 'invalid' }, { originalToken: 'invalid' }, { password: 'synthetic' }, { apiBase: 'https://other.example.invalid' }, { apiBase: base + '?key=synthetic' }])('rejects invalid/expanded recovery metadata %j', change => expect(() => parseDeletionJournal(JSON.stringify({ ...JSON.parse(journal()), ...change }), base)).toThrow());
  it('rejects invalid JSON or an oversized record', () => { expect(() => parseDeletionJournal('{', base)).toThrow(); expect(() => parseDeletionJournal('x'.repeat(4001), base)).toThrow(); });
  it('checks the fresh account before saving, without a deletion or automatic mutation', async () => {
    const api = vi.fn().mockResolvedValue({ id: 1, phoneNumber: 'synthetic' }), save = vi.fn().mockResolvedValue(undefined);
    const makeApi = vi.fn(() => api as SecurityApi);
    expect((await prepareDeletion(journal(), base, save, false, makeApi)).clientActionId).toBe(action);
    expect(makeApi).toHaveBeenCalledWith(JSON.parse(journal()));
    expect(api.mock.calls).toEqual([['/users/me']]); expect(save).toHaveBeenCalledWith(journal());
  });
  it('never saves or sends a deletion for a different fresh account', async () => {
    const api = vi.fn().mockResolvedValue({ id: 2, phoneNumber: 'synthetic' }), save = vi.fn();
    await expect(prepareDeletion(journal(), base, save, false, () => api as SecurityApi)).rejects.toThrow(); expect(save).not.toHaveBeenCalled();
  });
  it('fails closed when encrypted recovery saving fails', async () => {
    const api = vi.fn().mockResolvedValue({ id: 1, phoneNumber: 'synthetic' });
    await expect(prepareDeletion(journal(), base, async () => { throw new Error('Synthetic storage interruption'); }, false, () => api as SecurityApi)).rejects.toThrow();
    expect(api).toHaveBeenCalledTimes(1);
  });
});
describe('bound deletion or abandon acknowledgement', () => {
  it('keeps cleanup pending honest and strips unrelated content', () => { expect(parseDeletionAck({ ...ack(), privateProfile: 'synthetic' }, action)).toEqual(ack()); expect(parseDeletionAck(cancelled(), action)).toEqual(cancelled()); });
  it.each([{ clientActionId: randomUUID() }, { state: 'COMPLETE' }, { accountDeleted: false }, { erasedAt: null }, { erasedAt: 'yesterday' }, { photoCleanupPending: -1 }, { photoCleanupPending: 1.5 }, { legacyCleanupPending: '0' }, { legacyCleanupPending: 2147483648 }])('does not accept malformed or cross-operation deletion proof %j', change => expect(() => parseDeletionAck({ ...ack(), ...change }, action)).toThrow());
  it.each([{ accountDeleted: true }, { erasedAt: ack().erasedAt }, { photoCleanupPending: 1 }, { legacyCleanupPending: 1 }])('does not accept contradictory abandon proof %j', change => expect(() => parseDeletionAck({ ...cancelled(), ...change }, action)).toThrow());
});
describe('one explicit mutation; restart and lost-ACK recovery query only', () => {
  it('sends an exact current password and immutable action binding, without storing the password', async () => {
    const api = vi.fn().mockResolvedValue(ack()); expect((await submitDeletion(api as SecurityApi, action, ' Synthetic123 ')).kind).toBe('erased');
    expect(api).toHaveBeenCalledTimes(1); expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ currentPassword: ' Synthetic123 ', clientActionId: action, confirmation: 'DELETE_MY_ACCOUNT' });
  });
  it('recovers a lost deletion response with GET, never an automatic DELETE retry', async () => {
    const api = vi.fn().mockRejectedValueOnce(new Error('Synthetic timeout')).mockResolvedValueOnce(ack());
    expect((await submitDeletion(api as SecurityApi, action, 'Synthetic123')).kind).toBe('erased');
    expect(api.mock.calls.map(c => c[1]?.method ?? 'GET')).toEqual(['DELETE', 'GET']);
  });
  it.each([401, 404, 429, 503])('never treats receipt failure %i as deletion or cancellation success', async status => {
    const api = vi.fn().mockRejectedValue(new ApiError(status)); const result = await lookupDeletion(api as SecurityApi, action);
    expect(result.kind).toBe('unconfirmed'); expect(api.mock.calls).toEqual([['/users/me/deletion-operations/' + action]]);
  });
  it('does not infer success from revoked ordinary session or try an unrelated profile probe', async () => {
    const api = vi.fn().mockRejectedValueOnce(new ApiError(401)).mockRejectedValueOnce(new ApiError(404));
    expect((await submitDeletion(api as SecurityApi, action, 'Synthetic123')).kind).toBe('unconfirmed');
    expect(api.mock.calls.map(c => c[0])).toEqual(['/users/me', '/users/me/deletion-operations/' + action]);
  });
  it('returns committed deletion rather than falsely cancelling when abandon loses the race', async () => {
    const api = vi.fn().mockResolvedValue(ack()); expect((await abandonDeletion(api as SecurityApi, action)).kind).toBe('erased');
    expect(api.mock.calls).toEqual([['/users/me/deletion-operations/' + action + '/abandon', { method: 'POST', body: '{}' }]]);
  });
  it('requires real server abandon proof before considering delayed originals cancelled', async () => {
    const api = vi.fn().mockResolvedValue(cancelled()); expect((await abandonDeletion(api as SecurityApi, action)).kind).toBe('abandoned');
  });
  it('queries only after losing an abandon response', async () => {
    const api = vi.fn().mockRejectedValueOnce(new Error('Synthetic timeout')).mockResolvedValueOnce(cancelled());
    expect((await abandonDeletion(api as SecurityApi, action)).kind).toBe('abandoned'); expect(api.mock.calls.map(c => c[1]?.method ?? 'GET')).toEqual(['POST', 'GET']);
  });
  it('rejects invalid local requests before making any network call', async () => {
    const api = vi.fn(); await expect(submitDeletion(api as SecurityApi, 'invalid', 'Synthetic123')).rejects.toThrow();
    await expect(submitDeletion(api as SecurityApi, action, '')).rejects.toThrow(); await expect(submitDeletion(api as SecurityApi, action, 'x\u0000')).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
  });
});
