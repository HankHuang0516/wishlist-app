import type { PrivateStore } from './pendingStore';
import { validateApiUrl } from './api';
import { parseDeletionAck, parseDeletionJournal, type DeletionAck, type DeletionJournal } from './accountDeletion';
import { SESSION_KEY } from './session';

export const DELETION_STORAGE_ISSUE = '無法安全讀取或清理刪除恢復資料；不會自動重送刪除或改存明文。請重試。';
type RecoveryRecord = { version: 1; journal: DeletionJournal; proof: DeletionAck | null };
const queues = new WeakMap<PrivateStore, Map<string, Promise<unknown>>>();
export function createDeletionRecovery(store: PrivateStore, key: string, apiUrl: string, local = false) {
  function validateJournal(encoded: string) {
    const journal = parseDeletionJournal(encoded, apiUrl, local);
    // Canonical journal is ASCII: URL origin is normalized/punycoded and JWT
    // syntax is ASCII. Avoid depending on a web TextEncoder native polyfill.
    if (encoded !== JSON.stringify(journal) || !/^[\x00-\x7f]*$/.test(encoded) || encoded.length > 1900) throw new Error(DELETION_STORAGE_ISSUE);
    return journal;
  }
  function encode(saved: RecoveryRecord) {
    const encoded = JSON.stringify(saved);
    if (!/^[\x00-\x7f]*$/.test(encoded) || encoded.length > 1900) throw new Error(DELETION_STORAGE_ISSUE);
    return encoded;
  }
  function reserveProof(journal: DeletionJournal) {
    encode({ version: 1, journal, proof: { state: 'ERASED', accountDeleted: true, clientActionId: journal.clientActionId, erasedAt: '+275760-09-13T00:00:00.000Z', photoCleanupPending: 2147483647, legacyCleanupPending: 2147483647 } });
  }
  function parse(encoded: string): RecoveryRecord {
    if (encoded.length > 1900) throw new Error(DELETION_STORAGE_ISSUE);
    const saved = JSON.parse(encoded) as RecoveryRecord;
    if (!saved || Object.keys(saved).sort().join(',') !== 'journal,proof,version' || saved.version !== 1) throw new Error(DELETION_STORAGE_ISSUE);
    const journal = validateJournal(JSON.stringify(saved.journal));
    reserveProof(journal); // Budget must work before sending any deletion.
    const proof = saved.proof === null ? null : parseDeletionAck(saved.proof, journal.clientActionId);
    const canonical = { version: 1 as const, journal, proof };
    if (encode(canonical) !== encoded) throw new Error(DELETION_STORAGE_ISSUE);
    return canonical;
  }
  function same(saved: DeletionJournal, expected: DeletionJournal) {
    if (saved.userId !== expected.userId || saved.clientActionId !== expected.clientActionId || saved.originalToken !== expected.originalToken || saved.apiBase !== expected.apiBase) throw new Error(DELETION_STORAGE_ISSUE);
  }
  function serial<T>(work: () => Promise<T>): Promise<T> {
    let all = queues.get(store); if (!all) { all = new Map(); queues.set(store, all); }
    const next = (all.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    all.set(key, next);
    void next.finally(() => { if (all.get(key) === next) all.delete(key); }).catch(() => undefined);
    return next;
  }
  async function persist(encoded: string) {
    try { await store.set(key, encoded); }
    catch { if (await store.get(key) !== encoded) throw new Error(DELETION_STORAGE_ISSUE); }
  }
  // One atomic bounded encrypted record, including acknowledged proof. A
  // later JWT expiry must not erase knowledge of an already-proven outcome.
  return {
    read: () => serial(async () => {
      const encoded = await store.get(key);
      return encoded === null ? null : parse(encoded).journal;
    }),
    save: (encoded: string) => serial(async () => {
      const journal = validateJournal(encoded), next = encode({ version: 1, journal, proof: null });
      reserveProof(journal);
      const existing = await store.get(key);
      if (existing !== null) { same(parse(existing).journal, journal); return; }
      await persist(next);
    }),
    readProof: (journal: DeletionJournal) => serial(async () => {
      const encoded = await store.get(key);
      if (encoded === null) return null;
      const saved = parse(encoded); same(saved.journal, journal); return saved.proof;
    }),
    saveProof: (journal: DeletionJournal, value: DeletionAck) => serial(async () => {
      const encoded = await store.get(key);
      if (encoded === null) throw new Error(DELETION_STORAGE_ISSUE);
      const saved = parse(encoded); same(saved.journal, journal);
      const proof = parseDeletionAck(value, journal.clientActionId);
      if (saved.proof && (saved.proof.state !== proof.state || saved.proof.erasedAt !== proof.erasedAt)) throw new Error(DELETION_STORAGE_ISSUE);
      await persist(encode({ version: 1, journal: saved.journal, proof }));
    }),
    clear: (journal: DeletionJournal) => serial(async () => {
      const encoded = await store.get(key);
      if (encoded === null) return;
      const saved = parse(encoded); same(saved.journal, journal);
      if (!saved.proof) throw new Error(DELETION_STORAGE_ISSUE); // Unknown != cancelled.
      try { await store.remove(key); }
      catch { if (await store.get(key) !== null) throw new Error(DELETION_STORAGE_ISSUE); }
    }),
  };
}
export type DeletionRecovery = ReturnType<typeof createDeletionRecovery>;
export async function restoreAfterDeletionCheck<T>(readRecovery: () => Promise<DeletionJournal | null>, restore: () => Promise<T>) {
  let journal: DeletionJournal | null;
  try { journal = await readRecovery(); }
  catch { return { kind: 'deletion-storage-unavailable' as const }; }
  if (journal) return { kind: 'deletion' as const, journal };
  return { kind: 'session' as const, session: await restore() };
}
export async function clearErasedSession(store: PrivateStore, journal: DeletionJournal, local = false) {
  const encoded = await store.get(SESSION_KEY);
  if (encoded === null) return;
  const session: unknown = JSON.parse(encoded);
  if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error(DELETION_STORAGE_ISSUE);
  const saved = session as Record<string, unknown>;
  if (saved.version !== 2 || typeof saved.apiBase !== 'string' || typeof saved.token !== 'string') throw new Error(DELETION_STORAGE_ISSUE);
  // Never erase a later account or another service's session on old ACKs.
  if (validateApiUrl(saved.apiBase, local) !== journal.apiBase || saved.token !== journal.originalToken) return;
  try { await store.remove(SESSION_KEY); }
  catch { if (await store.get(SESSION_KEY) !== null) throw new Error(DELETION_STORAGE_ISSUE); }
}
