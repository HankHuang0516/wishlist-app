import { afterEach, describe, expect, it, vi } from 'vitest';
import { abandonDeletion, lookupDeletion, parseDeletionAck, parsePendingDeletion, submitDeletion, type PendingDeletion } from './accountDeletionWeb';

const actionId = '11111111-1111-4111-8111-111111111111';
const journal: PendingDeletion = { version: 1, apiUrl: '/api', userId: 19, clientActionId: actionId, originalToken: 'original-session' };
const erased = { state: 'ERASED', accountDeleted: true, clientActionId: actionId,
  erasedAt: '2026-09-26T00:00:00.000Z', photoCleanupPending: 2, legacyCleanupPending: 1 };
const abandoned = { state: 'ABANDONED', accountDeleted: false, clientActionId: actionId,
  erasedAt: null, photoCleanupPending: 0, legacyCleanupPending: 0 };

afterEach(() => vi.unstubAllGlobals());

describe('browser account deletion safety', () => {
  it('binds recovery to the exact API and rejects malformed or cross-service journals', () => {
    expect(parsePendingDeletion(null, '/api')).toBeNull();
    expect(parsePendingDeletion(JSON.stringify(journal), '/api')).toEqual(journal);
    expect(() => parsePendingDeletion(JSON.stringify(journal), 'https://elsewhere.example/api')).toThrow();
    expect(() => parsePendingDeletion('{', '/api')).toThrow();
    expect(() => parsePendingDeletion(JSON.stringify({ ...journal, password: 'secret' }), '/api')).toThrow();
  });

  it('requires the original operation ID and a consistent authoritative state', () => {
    expect(parseDeletionAck(erased, actionId)).toEqual(erased);
    expect(parseDeletionAck(abandoned, actionId)).toEqual(abandoned);
    expect(() => parseDeletionAck({ ...erased, clientActionId: '22222222-2222-4222-8222-222222222222' }, actionId)).toThrow();
    expect(() => parseDeletionAck({ ...erased, accountDeleted: false }, actionId)).toThrow();
    expect(() => parseDeletionAck({ ...erased, photoCleanupPending: -1 }, actionId)).toThrow();
  });

  it('sends one DELETE, then uses only GET after a lost response', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('reply lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => erased });
    vi.stubGlobal('fetch', fetch);
    expect(await submitDeletion(journal, 'correct-password')).toEqual({ kind: 'confirmed', ack: erased });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ currentPassword: 'correct-password', clientActionId: actionId, confirmation: 'DELETE_MY_ACCOUNT' });
    expect(fetch.mock.calls[1][1].method).toBeUndefined();
    expect(fetch.mock.calls[1][0]).toContain(`/deletion-operations/${actionId}`);
  });

  it('does not claim deletion when receipt lookup fails or is absent', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetch);
    expect(await lookupDeletion(journal)).toEqual({ kind: 'unconfirmed' });
    expect(await submitDeletion(journal, 'password')).toEqual({ kind: 'unconfirmed' });
    expect(fetch.mock.calls.filter((call) => call[1]?.method === 'DELETE')).toHaveLength(1);
  });

  it('uses server-side abandonment as the only safe cancellation barrier', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => abandoned });
    vi.stubGlobal('fetch', fetch);
    expect(await abandonDeletion(journal)).toEqual({ kind: 'confirmed', ack: abandoned });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(fetch.mock.calls[0][0]).toContain(`/deletion-operations/${actionId}/abandon`);
  });
});
