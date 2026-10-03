import { api } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { sha256, type PendingStore } from './webPendingStore';
import type { ManagedListing, ManagedStatus } from './managedListingWeb';

export class ManagementOperationError extends Error { constructor() { super('原商品操作或回執不正確；不會自動重送。'); } }
const fail = (): never => { throw new ManagementOperationError(); };
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const exact = (row: Record<string, unknown>, keys: string[]) => { if (Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail(); };
const uuid = (v: unknown) => isUuid(v) && v === v.toLowerCase();
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && new TextDecoder().decode(new TextEncoder().encode(v)) === v;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const status = (v: unknown) => ['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED'].includes(String(v)) && typeof v === 'string';
export type ManagementBody = { kind: 'EDIT' | 'EXTEND' | 'STATUS' | 'MAP'; listingId: string; expectedVersion: number; changes: Record<string, unknown> };
export function managementBody(value: unknown): ManagementBody {
  const row = object(value); exact(row, ['kind', 'listingId', 'expectedVersion', 'changes']);
  if (!uuid(row.listingId) || !Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1 || Number(row.expectedVersion) > 2147483646) return fail();
  const changes = object(row.changes); let normalized: Record<string, unknown>;
  if (row.kind === 'EDIT') {
    if (!Object.hasOwn(changes, 'title') || Object.keys(changes).some(key => !['title', 'description', 'price'].includes(key)) || !text(changes.title, 100) || !(changes.title as string).trim() ||
      (changes.description !== undefined && (!text(changes.description, 3000) || !(changes.description as string).trim())) ||
      (changes.price !== undefined && (typeof changes.price !== 'number' || !Number.isFinite(changes.price) || changes.price < 0 || changes.price > 9999999999.99 || Math.abs(changes.price * 100 - Math.round(changes.price * 100)) > 0.001))) return fail();
    normalized = { title: (changes.title as string).trim(), ...(changes.description !== undefined ? { description: (changes.description as string).trim() } : {}), ...(changes.price !== undefined ? { price: changes.price } : {}) };
  } else if (row.kind === 'STATUS') {
    exact(changes, ['action']); if (typeof changes.action !== 'string' || !['reserve', 'release', 'sold', 'remove'].includes(changes.action)) return fail();
    normalized = { action: changes.action };
  } else if (row.kind === 'EXTEND') {
    exact(changes, ['expiryDate']); const d = changes.expiryDate;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T12:00:00Z')) || new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) !== d) return fail();
    normalized = { expiryDate: d };
  } else if (row.kind === 'MAP') {
    exact(changes, ['display', 'consentToMap']);
    if (typeof changes.display !== 'boolean' || changes.consentToMap !== changes.display) return fail();
    normalized = { display: changes.display, consentToMap: changes.display };
  } else return fail();
  return { kind: row.kind as ManagementBody['kind'], listingId: row.listingId as string, expectedVersion: Number(row.expectedVersion), changes: normalized };
}
type Original = Pick<ManagedListing, 'title' | 'description' | 'price' | 'version' | 'status' | 'expiresAt'>;
export type ManagementJournal = { version: 1; clientActionId: string; body: ManagementBody; requestHash: string; original: Original };
function original(value: unknown, version: number): Original {
  const row = object(value); exact(row, ['title', 'description', 'price', 'version', 'status', 'expiresAt']);
  if (row.version !== version || !text(row.title, 100) || !(row.title as string).trim() || !(row.description === null || text(row.description, 3000)) ||
    !(row.price === null || typeof row.price === 'number' && Number.isFinite(row.price) && row.price >= 0 && row.price <= 9999999999.99) || !status(row.status) || !(row.expiresAt === null || date(row.expiresAt))) return fail();
  return row as Original;
}
export async function managementJournal(body: ManagementBody, item: ManagedListing, clientActionId = crypto.randomUUID()) {
  if (!uuid(clientActionId) || item.id !== body.listingId) return fail(); const normalized = managementBody(body);
  const before = original({ title: item.title, description: item.description, price: item.price, version: item.version, status: item.status, expiresAt: item.expiresAt === null ? null : new Date(item.expiresAt).toISOString() }, normalized.expectedVersion);
  return JSON.stringify({ version: 1, clientActionId, body: normalized, requestHash: await sha256(JSON.stringify(normalized)), original: before });
}
export async function parseManagementJournal(raw: string): Promise<ManagementJournal> {
  let row; try { row = object(JSON.parse(raw)); } catch { return fail(); } exact(row, ['version', 'clientActionId', 'body', 'requestHash', 'original']);
  const body = managementBody(row.body); original(row.original, body.expectedVersion);
  if (row.version !== 1 || !uuid(row.clientActionId) || JSON.stringify(body) !== JSON.stringify(row.body) || row.requestHash !== await sha256(JSON.stringify(body))) return fail();
  return row as ManagementJournal;
}
export type ManagementResult = { state: 'APPLIED' | 'CONFLICT' | 'ABANDONED'; reason: string | null; appliedVersion: number | null; mapVisibleUntil?: string | null };
export async function managementResult(value: unknown, raw: string): Promise<ManagementResult> {
  const j = await parseManagementJournal(raw), row = object(value); exact(row, ['receipt']);
  const r = object(row.receipt); exact(r, ['clientActionId', 'listingId', 'kind', 'expectedVersion', 'requestHash', 'state', 'reason', 'appliedVersion', 'createdAt', ...(j.body.kind === 'MAP' ? ['mapVisibleUntil'] : [])]);
  if (r.clientActionId !== j.clientActionId || r.listingId !== j.body.listingId || r.kind !== j.body.kind || r.expectedVersion !== j.body.expectedVersion || r.requestHash !== j.requestHash || !date(r.createdAt)) return fail();
  if (r.state === 'APPLIED') { if (r.appliedVersion !== j.body.expectedVersion + 1 || r.reason !== null) return fail(); }
  else if (r.state === 'CONFLICT' || r.state === 'ABANDONED') {
    if (r.appliedVersion !== null || (r.state === 'CONFLICT' ? typeof r.reason !== 'string' || !['LISTING_CONFLICT', 'INVALID_LISTING_INPUT', 'LISTING_ACCESS_DENIED'].includes(r.reason) : r.reason !== null)) return fail();
  } else return fail();
  if (j.body.kind === 'MAP') {
    if (r.state === 'APPLIED' && j.body.changes.display === true) {
      if (!date(r.mapVisibleUntil) || Date.parse(r.mapVisibleUntil as string) > Date.parse(r.createdAt as string) + 3_600_000 || Date.parse(r.mapVisibleUntil as string) <= Date.parse(r.createdAt as string) - 30_000) return fail();
    } else if (r.mapVisibleUntil !== null) return fail();
  }
  return { state: r.state, reason: r.reason as string | null, appliedVersion: r.appliedVersion as number | null, ...(j.body.kind === 'MAP' ? { mapVisibleUntil: r.mapVisibleUntil as string | null } : {}) };
}
export async function readManagement(token: string, raw: string) { const j = await parseManagementJournal(raw); return managementResult(await api(token, '/listings/management-operations/' + j.clientActionId), raw); }
export async function sendManagement(token: string, raw: string, store: PendingStore, key: string, active: () => boolean) {
  const j = await parseManagementJournal(raw); if (!active()) return fail();
  await store.save(key, raw); if (!active()) return fail();
  const value = await api(token, '/listings/management-operations/' + j.clientActionId, { method: 'POST', body: JSON.stringify(j.body) });
  if (!active()) return fail(); return managementResult(value, raw);
}
export async function abandonManagement(token: string, raw: string, active: () => boolean) {
  const j = await parseManagementJournal(raw); if (!active()) return fail(); const b = j.body;
  const value = await api(token, '/listings/management-operations/' + j.clientActionId + '/abandon', { method: 'POST', body: JSON.stringify({ kind: b.kind, listingId: b.listingId, expectedVersion: b.expectedVersion, requestHash: j.requestHash }) });
  if (!active()) return fail(); return managementResult(value, raw);
}
export function managementTargetStatus(body: ManagementBody, before: Original): ManagedStatus {
  return body.kind === 'STATUS' ? ({ reserve: 'RESERVED', release: 'ACTIVE', sold: 'SOLD', remove: 'REMOVED' } as const)[body.changes.action as 'reserve' | 'release' | 'sold' | 'remove']
    : body.kind === 'EXTEND' && before.status === 'EXPIRED' ? 'ACTIVE' : before.status;
}
