import { privatePendingStore, type PendingStore } from './webPendingStore';

export type DiagnosticsMarker = { version: 1; localOperationId: string; startedAt: string };
export class DiagnosticsError extends Error {}
export class DiagnosticsRejected extends DiagnosticsError {}
export class DiagnosticsConflict extends DiagnosticsError {}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function parseDiagnosticsMarker(raw: string): DiagnosticsMarker {
  if (raw.length > 1000) throw new DiagnosticsError();
  let value: DiagnosticsMarker;
  try { value = JSON.parse(raw); } catch { throw new DiagnosticsError(); }
  if (!value || Object.keys(value).sort().join(',') !== 'localOperationId,startedAt,version' || value.version !== 1 || typeof value.localOperationId !== 'string' || !uuid.test(value.localOperationId) || typeof value.startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.startedAt) || !Number.isFinite(Date.parse(value.startedAt)) || new Date(value.startedAt).toISOString() !== value.startedAt) throw new DiagnosticsError();
  return value;
}
function init(token: string, method: string): RequestInit {
  return { method, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) };
}
export async function readDiagnosticsCapability(api: string, token: string, userId: number) {
  const response = await fetch(`${api}/feedback/test`, init(token, 'GET'));
  if (!response.ok) throw new DiagnosticsError();
  const value = await response.json();
  if (!value || Object.keys(value).sort().join(',') !== 'canSend,userId' || value.userId !== userId || typeof value.canSend !== 'boolean') throw new DiagnosticsError();
  return value.canSend as boolean;
}
export async function dispatchEmailDiagnostic(api: string, token: string, key: string, raw: string, active: () => boolean, store: PendingStore = privatePendingStore) {
  parseDiagnosticsMarker(raw);
  if (!active()) throw new DiagnosticsError();
  if (await store.get(key) !== raw) throw new DiagnosticsConflict();
  if (!active()) throw new DiagnosticsError();
  const response = await fetch(`${api}/feedback/test`, init(token, 'POST'));
  const value = await response.json();
  if (!response.ok) {
    const rejected = ['EMAIL_DIAGNOSTICS_AUTH_REQUIRED','EMAIL_DIAGNOSTICS_DENIED','EMAIL_DIAGNOSTICS_DISABLED','EMAIL_DIAGNOSTICS_INVALID_REQUEST','EMAIL_DIAGNOSTICS_RATE_LIMIT','EMAIL_DIAGNOSTICS_BUSY'];
    if (value && Object.keys(value).length === 1 && rejected.includes(value.errorCode) && [400,401,403,429,503].includes(response.status)) throw new DiagnosticsRejected();
    throw new DiagnosticsError();
  }
  if (!value || Object.keys(value).sort().join(',') !== 'notificationStatus,success' || value.success !== true || value.notificationStatus !== 'ACCEPTED') throw new DiagnosticsError();
}
