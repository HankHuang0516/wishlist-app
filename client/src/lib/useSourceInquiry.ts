import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { api, ApiFailure } from './marketplaceApi';
import { parseLeadRoom, type LeadRoom } from './sourceLeadData';
import { privatePendingStore, PendingStoreError } from './webPendingStore';
import { parseSourcePending, parseSourceReceipt, readSourceRecovery, sourceJournalKey, sourcePendingIdentity, type SourceJournal, type SourcePayload, type SourceRecovery } from './sourceInquiryRecovery';
import { sourceContactText as text } from './sourceContactCopy';
type Action = 'READ' | 'RETRY' | 'ASK' | 'CONSENT' | 'CANCEL';
type View = { scope: string; room: LeadRoom | null; recovery: SourceRecovery; ready: boolean; error: string; notice: string };
const empty = (scope: string): View => ({ scope, room: null, recovery: { inquiry: null, cancel: null }, ready: false, error: '', notice: '' });
export function useSourceInquiry(id: string) {
 const { token, user } = useAuth(), scope = `${API_URL}:${user?.id ?? 'anonymous'}:${token ?? ''}:${id}`;
 const currentScope = useRef(scope); currentScope.current = scope;
 const running = useRef<{ scope: string; controller: AbortController } | null>(null);
 const [view, setView] = useState<View>(empty(scope)), [draft, setDraft] = useState({ scope, value: '' }), [busyScope, setBusyScope] = useState('');
 const [retryUntil, setRetryUntil] = useState(0), [now, setNow] = useState(Date.now());
 const visible = view.scope === scope ? view : empty(scope), room = visible.room;
 const question = draft.scope === scope ? draft.value : '', busy = busyScope === scope, waiting = Math.max(0, Math.ceil((retryUntil - now) / 1000));
 useEffect(() => { if (retryUntil <= Date.now()) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryUntil]);
 useEffect(() => {
  currentScope.current = scope;
  running.current?.controller.abort(); running.current = null; setView(empty(scope)); setDraft({ scope, value: '' }); setBusyScope('');
  if (token && user) void action('READ');
  return () => { running.current?.controller.abort(); currentScope.current = 'unmounted'; };
 }, [scope]);
 async function action(kind: Action) {
  if (!token || !user || running.current?.scope === scope || retryUntil > Date.now()) return;
  const requestScope = scope, auth = token, owner = user.id, controller = new AbortController(), ticket = { scope, controller };
  running.current = ticket; setBusyScope(scope);
  const current = () => currentScope.current === requestScope && running.current === ticket && !controller.signal.aborted;
  const publish = (changes: Partial<View>) => { if (current()) setView(old => ({ ...(old.scope === requestScope ? old : empty(requestScope)), ...changes })); };
  const deadline = setTimeout(() => controller.abort(), 30_000);
  function bounded<T>(operation: Promise<T>): Promise<T> {
   return new Promise((resolve, reject) => {
    const abort = () => reject(new Error());
    controller.signal.addEventListener('abort', abort, { once: true });
    if (controller.signal.aborted) abort();
    operation.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
   });
  }
  async function request(path: string, body?: unknown) {
   if (!current()) throw new Error();
   return api<unknown>(auth, path, { signal: controller.signal, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  }
  async function clearJournal(journal: SourceJournal) {
   if (!current()) throw new Error();
   const cleared = await bounded(privatePendingStore.clear(journal.key, journal.body));
   // Stale acknowledgments cannot erase or hide another tab's newer operation.
   if (!cleared && await bounded(privatePendingStore.get(journal.key)) !== null) throw new PendingStoreError();
  }
  async function receipt(journal: SourceJournal, active: LeadRoom | null) {
   const rid = journal.operation.version === 1 ? journal.operation.roomId : active?.id; if (!rid) return null;
   const identity = sourcePendingIdentity(journal.operation);
   return parseSourceReceipt(await request(`/source-leads/${id}/inquiry/${rid}/actions/${identity.requestId}`), journal.operation, rid);
  }
  publish({ error: '', notice: '' }); let storageReady = false;
  try {
   let recovery: SourceRecovery = { inquiry: null, cancel: null }, storageFailure = false;
   try { recovery = await bounded(readSourceRecovery(privatePendingStore, API_URL, owner, id, sessionStorage)); storageReady = true; } catch { if (controller.signal.aborted) throw new Error(); storageFailure = true; }
   if (!current()) return;
   if (!storageFailure) publish({ recovery, ready: true });
   const roomPath = `/source-leads/${id}/inquiry?presentation=1`, raw = await request(roomPath);
   let active = raw === null ? null : parseLeadRoom(raw, id); if (!current()) return; publish({ room: active });
   if (storageFailure) throw new PendingStoreError();
   let stopped = false;
   async function acknowledge(journal: SourceJournal, found: LeadRoom) {
    const cancelled = sourcePendingIdentity(journal.operation).action === 'CANCEL';
    // A terminal withdrawal fences late ASK/CONSENT on the same owned room.
    // Clearing that stopped question does not claim the question was accepted.
    if (cancelled && found.state === 'CANCELLED' && recovery.inquiry) {
     const original = recovery.inquiry;
     if (original.operation.version === 1 && original.operation.roomId !== found.id) throw new PendingStoreError();
     await clearJournal(original); recovery = { ...recovery, inquiry: null }; stopped = true;
    }
    await clearJournal(journal); recovery = { ...recovery, [cancelled ? 'cancel' : 'inquiry']: null };
    if (sourcePendingIdentity(journal.operation).action === 'ASK' || stopped) setDraft(old => current() ? { scope: requestScope, value: '' } : old);
    publish({ recovery, room: found, notice: stopped ? text('stopped') : '' });
   }
   for (const slot of ['inquiry', 'cancel'] as const) {
    const journal = recovery[slot]; if (!journal) continue;
    const found = await receipt(journal, active); if (!current()) return;
    if (found) { active = found; await acknowledge(journal, found); }
   }
   publish({ ready: true }); if (kind === 'READ') return;
   let journal = kind === 'RETRY' ? recovery.cancel ?? recovery.inquiry : kind === 'CANCEL' ? recovery.cancel : null;
   if (kind === 'RETRY' && !journal) return;
   if (journal?.operation.version === 0) { publish({ error: text('legacy') }); return; }
   if (kind !== 'CANCEL' && kind !== 'RETRY' && (recovery.inquiry || recovery.cancel)) { publish({ error: text('pending') }); return; }
   if (!journal) {
    if (!active) {
     if (kind !== 'ASK' || recovery.inquiry || recovery.cancel) { publish({ error: text('noRoom') }); return; }
     await request(`/source-leads/${id}`); active = parseLeadRoom(await request(roomPath, {}), id); if (!current()) return; publish({ room: active });
    }
    if (kind !== 'CANCEL') {
     if (room ? room.transferHash !== active.transferHash : active.events.some(e => e.action === 'ASK')) { publish({ error: text('changed') }); return; }
     await request(`/source-leads/${id}`);
    }
    const payload: SourcePayload = kind === 'ASK' ? { requestId: crypto.randomUUID(), action: 'ASK', text: question, consent: true, transferHash: active.transferHash } : kind === 'CONSENT' ? { requestId: crypto.randomUUID(), action: 'CONSENT', consent: true, transferHash: active.transferHash } : { requestId: crypto.randomUUID(), action: 'CANCEL' };
    const body = JSON.stringify({ version: 1, leadId: id, roomId: active.id, payload }), key = await sourceJournalKey(API_URL, owner, id, payload.action === 'CANCEL'), operation = parseSourcePending(body, id);
    await bounded(privatePendingStore.save(key, body)); if (!current()) return;
    journal = { key, body, operation }; recovery = { ...recovery, [payload.action === 'CANCEL' ? 'cancel' : 'inquiry']: journal }; publish({ recovery });
   }
   if (journal.operation.version !== 1) throw new PendingStoreError();
   const operation = journal.operation;
   const result = parseLeadRoom(await request(`/source-leads/${id}/inquiry/${operation.roomId}/actions?presentation=1`, operation.payload), id); if (!current()) return;
   if (result.id !== operation.roomId || !result.events.some(e => e.requestId === operation.payload.requestId && e.action === operation.payload.action && e.text === operation.payload.text)) throw new PendingStoreError();
   publish({ room: result }); const found = await receipt(journal, result); if (!current()) return;
   if (!found) { publish({ error: text('failure') }); return; }
   await acknowledge(journal, found);
  } catch (failure) {
   // A later 401/429/409 is not proof about the original unknown POST. Keep
   // its full journal and never display untrusted exception/response text.
   if (currentScope.current === requestScope && running.current === ticket) {
    const storage = failure instanceof PendingStoreError;
    setView(old => ({ ...old, scope: requestScope, ready: storageReady && !storage, error: text(storage ? 'storage' : failure instanceof ApiFailure && failure.status === 401 ? 'auth' : failure instanceof ApiFailure && failure.status === 429 ? 'limited' : 'failure') }));
    if (failure instanceof ApiFailure && failure.retryAfterMs) { setRetryUntil(Date.now() + failure.retryAfterMs); setNow(Date.now()); }
   }
  } finally { clearTimeout(deadline); if (running.current === ticket) { running.current = null; if (currentScope.current === requestScope) setBusyScope(''); } }
 }
 return { ...visible, token, question, setQuestion: (value: string) => setDraft({ scope, value }), busy, waiting, action };
}
