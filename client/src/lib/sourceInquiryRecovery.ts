import { isUuid } from './listingBatch';
import { parseLeadRoom, type LeadRoom } from './sourceLeadData';
import { pendingRequestKey, PendingStoreError, type PendingStore } from './webPendingStore';

export type SourceAction = 'ASK' | 'CONSENT' | 'CANCEL';
export type SourcePayload = { requestId: string; action: SourceAction; text?: string; consent?: true; transferHash?: string };
export type SourcePending = { version: 1; leadId: string; roomId: string; payload: SourcePayload } | { version: 0; leadId: string; requestId: string; action: SourceAction };
export type SourceJournal = { key: string; body: string; operation: SourcePending };
export type SourceRecovery = { inquiry: SourceJournal | null; cancel: SourceJournal | null };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PendingStoreError();
  return value as Record<string, unknown>;
};
const exact = (row: Record<string, unknown>, keys: string[]) => { if (Object.keys(row).some(key => !keys.includes(key))) throw new PendingStoreError(); };
export function parseSourcePayload(value: unknown, legacy = false): SourcePayload {
  const row = object(value); exact(row, ['requestId', 'action', 'text', 'consent', 'transferHash']);
  if (!isUuid(row.requestId) || !['ASK', 'CONSENT', 'CANCEL'].includes(row.action as string)) throw new PendingStoreError();
  if (row.action === 'CANCEL') { if (Object.keys(row).length !== 2) throw new PendingStoreError(); }
  else {
    if (row.action === 'ASK' ? typeof row.text !== 'string' || !row.text.trim() || row.text.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row.text) : row.text !== undefined) throw new PendingStoreError();
    if (!(legacy && row.action === 'ASK' && row.consent === undefined && row.transferHash === undefined) && (row.consent !== true || typeof row.transferHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.transferHash))) throw new PendingStoreError();
  }
  return row as SourcePayload;
}
export function sourcePendingIdentity(operation: SourcePending) {
  return operation.version === 1 ? { requestId: operation.payload.requestId, action: operation.payload.action } : { requestId: operation.requestId, action: operation.action };
}
export function parseSourcePending(body: string, leadId: string): SourcePending {
  let row: Record<string, unknown>; try { row = object(JSON.parse(body)); } catch { throw new PendingStoreError(); }
  if (!isUuid(leadId) || row.leadId !== leadId) throw new PendingStoreError();
  if (row.version === 1) {
    exact(row, ['version', 'leadId', 'roomId', 'payload']); if (!isUuid(row.roomId)) throw new PendingStoreError();
    return { version: 1, leadId, roomId: row.roomId, payload: parseSourcePayload(row.payload) };
  }
  exact(row, ['version', 'leadId', 'requestId', 'action']);
  if (row.version !== 0 || !isUuid(row.requestId) || !['ASK', 'CONSENT', 'CANCEL'].includes(row.action as string)) throw new PendingStoreError();
  return row as SourcePending;
}
export async function sourceJournalKey(apiUrl: string, userId: number, leadId: string, cancel = false) {
  if (!isUuid(leadId)) throw new PendingStoreError();
  return pendingRequestKey(apiUrl, userId, (cancel ? 'source-cancel.' : 'source-inquiry.') + leadId);
}
export async function readSourceRecovery(store: PendingStore, apiUrl: string, userId: number, leadId: string, legacyStorage: Storage): Promise<SourceRecovery> {
  const inquiryKey = await sourceJournalKey(apiUrl, userId, leadId), cancelKey = await sourceJournalKey(apiUrl, userId, leadId, true);
  const read = async (key: string, cancel: boolean): Promise<SourceJournal | null> => {
    const body = await store.get(key); if (body === null) return null;
    const operation = parseSourcePending(body, leadId);
    if ((sourcePendingIdentity(operation).action === 'CANCEL') !== cancel) throw new PendingStoreError();
    return { key, body, operation };
  };
  const recovery = { inquiry: await read(inquiryKey, false), cancel: await read(cancelKey, true) };
  // Old markers do not contain the original text/consent snapshot. Preserve
  // their identity for receipt lookup; never turn them into a replacement POST.
  const legacyKey = `source-lead-request:${userId}:${leadId}`;
  let raw: string | null; try { raw = legacyStorage.getItem(legacyKey); } catch { throw new PendingStoreError(); }
  if (raw !== null) {
    let marker: Record<string, unknown>; try { marker = object(JSON.parse(raw)); } catch { throw new PendingStoreError(); }
    exact(marker, ['requestId', 'action']);
    const operation = parseSourcePending(JSON.stringify({ ...marker, version: 0, leadId }), leadId), identity = sourcePendingIdentity(operation);
    const slot = identity.action === 'CANCEL' ? 'cancel' : 'inquiry', key = slot === 'cancel' ? cancelKey : inquiryKey;
    const current = recovery[slot];
    if (current && JSON.stringify(sourcePendingIdentity(current.operation)) !== JSON.stringify(identity)) throw new PendingStoreError();
    if (!current) {
      const body = JSON.stringify(operation); await store.save(key, body); recovery[slot] = { key, body, operation };
    }
    try {
      if (legacyStorage.getItem(legacyKey) !== raw) throw new PendingStoreError();
      legacyStorage.removeItem(legacyKey);
      if (legacyStorage.getItem(legacyKey) !== null) throw new PendingStoreError();
    } catch { throw new PendingStoreError(); }
  }
  return recovery;
}
export function parseSourceReceipt(value: unknown, operation: SourcePending, roomId: string): LeadRoom | null {
  if (value === null) return null;
  const row = object(value); exact(row, ['leadId', 'roomId', 'operation', 'room']);
  if (row.leadId !== operation.leadId || row.roomId !== roomId || operation.version === 1 && operation.roomId !== roomId) throw new PendingStoreError();
  const received = parseSourcePayload(row.operation, true), expected = sourcePendingIdentity(operation);
  if (received.requestId !== expected.requestId || received.action !== expected.action) throw new PendingStoreError();
  if (operation.version === 1 && ['requestId', 'action', 'text', 'consent', 'transferHash'].some(key => received[key as keyof SourcePayload] !== operation.payload[key as keyof SourcePayload])) throw new PendingStoreError();
  const room = parseLeadRoom(row.room, operation.leadId);
  const matches = room.events.filter(event => event.requestId === received.requestId);
  if (room.id !== roomId || matches.length !== 1 || matches[0].action !== received.action || matches[0].text !== received.text) throw new PendingStoreError();
  return room;
}
