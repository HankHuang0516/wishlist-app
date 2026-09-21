import { ApiError } from './api';
import { uuid } from './listingForm';
import type { PendingStore } from './pendingStore';

export const REPORT_REASONS = [['PROHIBITED', '禁售商品'], ['FRAUD', '疑似詐騙／內容不符'], ['HARASSMENT', '騷擾或不當內容'], ['SPAM', '垃圾或重複刊登'], ['OTHER', '其他']] as const;
export type ReportReason = typeof REPORT_REASONS[number][0];
export type ReportStatus = 'OPEN' | 'DISMISSED' | 'REMOVED';
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { OPEN: '已收件，待審核', DISMISSED: '審核已結束，未下架', REMOVED: '審核已結束，商品已下架' };
export type ReportRequest = { clientReportId: string; listingId: string; reason: ReportReason; details?: string };
export type ListingReport = { id: string; clientReportId: string; listingId: string; reason: ReportReason; details: string | null; status: ReportStatus; version: number; createdAt: string; updatedAt: string };
export type ReportPage = { items: ListingReport[]; nextCursor: string | null };
export class ReportInputError extends Error { constructor(message = '檢舉資料或回應格式不正確。') { super(message); } }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new ReportInputError();
    return value as Record<string, unknown>;
}
function id(value: unknown): string { if (!uuid(value)) throw new ReportInputError(); return value.toLowerCase(); }
function reason(value: unknown): ReportReason {
    if (!REPORT_REASONS.some(([key]) => key === value)) throw new ReportInputError('請選擇檢舉原因。'); return value as ReportReason;
}
function wellFormed(value: string) {
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
function text(value: unknown): string {
    if (typeof value !== 'string' || !wellFormed(value) || !value.trim() || value.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ReportInputError('補充說明限1000字元，不可含無效控制字元。');
    return value.trim();
}
function date(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new ReportInputError(); return value;
}
export function parseReportRequest(value: unknown): ReportRequest {
    const body = object(value, ['clientReportId', 'listingId', 'reason', 'details']);
    return { clientReportId: id(body.clientReportId), listingId: id(body.listingId), reason: reason(body.reason), ...(body.details === undefined ? {} : { details: text(body.details) }) };
}
export function buildReportRequest(listingId: string, clientReportId: string, reportReason: ReportReason, details: string) {
    if (typeof details !== 'string') throw new ReportInputError();
    return parseReportRequest({ listingId, clientReportId, reason: reportReason, ...(details.trim() ? { details } : {}) });
}
export function parseListingReport(value: unknown): ListingReport {
    const row = object(value, ['id', 'clientReportId', 'listingId', 'reason', 'details', 'status', 'version', 'createdAt', 'updatedAt']);
    const request = parseReportRequest({ clientReportId: row.clientReportId, listingId: row.listingId, reason: row.reason, ...(row.details === null ? {} : { details: row.details }) });
    if (row.details === undefined || !['OPEN', 'DISMISSED', 'REMOVED'].includes(row.status as string) || typeof row.version !== 'number' || !Number.isInteger(row.version) || row.version < 1 || row.version > 2147483647) throw new ReportInputError();
    const createdAt = date(row.createdAt), updatedAt = date(row.updatedAt);
    if (updatedAt < createdAt) throw new ReportInputError();
    return { ...request, id: id(row.id), details: request.details ?? null, status: row.status as ReportStatus, version: row.version, createdAt, updatedAt };
}
export function parseReportPage(value: unknown): ReportPage {
    const page = object(value, ['items', 'nextCursor']);
    if (!Array.isArray(page.items) || page.items.length > 25) throw new ReportInputError();
    const items = page.items.map(parseListingReport), nextCursor = page.nextCursor === null ? null : id(page.nextCursor);
    if (new Set(items.map(row => row.id)).size !== items.length || new Set(items.map(row => row.clientReportId)).size !== items.length || (nextCursor !== null && (items.length !== 25 || nextCursor !== items.at(-1)?.id))) throw new ReportInputError();
    return { items, nextCursor };
}
export function reportPagePath(cursor?: string) { return '/listing-reports/mine' + (cursor === undefined ? '' : '?cursor=' + id(cursor)); }
type ReportApi = (path: string, options?: RequestInit) => Promise<unknown>;
export type ReportResult = { kind: 'confirmed'; report: ListingReport; pendingCleared: boolean } | { kind: 'received-without-case' | 'abandoned'; pendingCleared: boolean } | { kind: 'unconfirmed'; message: string };
export type ReportDigest = (value: string) => Promise<string>;
export async function reportRequestHash(value: ReportRequest, digest: ReportDigest) {
    const request = parseReportRequest(value);
    const requestHash = await digest(JSON.stringify({ listingId: request.listingId, reason: request.reason, details: request.details ?? null }));
    if (typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash)) throw new ReportInputError();
    return requestHash;
}
function verifyReceipt(value: unknown, request: ReportRequest, submitted: boolean) {
    const response = object(value, submitted ? ['report', 'replayed'] : ['report']);
    if (submitted && typeof response.replayed !== 'boolean') throw new ReportInputError();
    const report = parseListingReport(response.report);
    if (report.clientReportId !== request.clientReportId || report.listingId !== request.listingId || report.reason !== request.reason || report.details !== (request.details ?? null)) throw new ReportInputError('回執與原檢舉內容不符，尚未確認成功。');
    return report;
}
async function clearAcknowledged(store: PendingStore, key: string, body: string) {
    let pendingCleared = false;
    try { pendingCleared = await store.clear(key, body); if (!pendingCleared) pendingCleared = await store.get(key) === null; }
    catch { /* Known server ACK is not downgraded by device cleanup failure. */ }
    return pendingCleared;
}
async function acknowledged(store: PendingStore, key: string, body: string, report: ListingReport): Promise<ReportResult> {
    return { kind: 'confirmed', report, pendingCleared: await clearAcknowledged(store, key, body) };
}
async function acknowledgeOperation(value: unknown, request: ReportRequest, store: PendingStore, key: string, digest: ReportDigest): Promise<ReportResult> {
    const response = object(value, ['operation', 'report']), operation = object(response.operation, ['clientReportId', 'requestHash', 'state', 'createdAt']);
    if (id(operation.clientReportId) !== request.clientReportId || operation.requestHash !== await reportRequestHash(request, digest) || !['RECEIVED', 'ABANDONED'].includes(operation.state as string)) throw new ReportInputError('操作回執與原檢舉不符，尚未確認。');
    date(operation.createdAt);
    if (response.report !== null) {
        if (operation.state !== 'RECEIVED') throw new ReportInputError();
        return acknowledged(store, key, JSON.stringify(request), verifyReceipt({ report: response.report }, request, false));
    }
    return { kind: operation.state === 'RECEIVED' ? 'received-without-case' : 'abandoned', pendingCleared: await clearAcknowledged(store, key, JSON.stringify(request)) };
}
function uncertain(error: unknown): ReportResult {
    return { kind: 'unconfirmed', message: error instanceof ApiError && error.status === 401 ? '登入已失效；原檢舉已保留，重新登入後請查回執，不代表送出成功或失敗。' : error instanceof ApiError && error.status === 409 ? '原識別碼或內容有衝突；請先查原回執，不要建立另一筆檢舉。' : '尚未確認檢舉結果；原內容已保留。請先查回執，查不到也不代表已取消。' };
}
export async function submitReport(api: ReportApi, store: PendingStore, key: string, value: ReportRequest): Promise<ReportResult> {
    const request = parseReportRequest(value), body = JSON.stringify(request);
    // Save failure propagates BEFORE HTTP. Never create or silently replace a
    // second journal. Every explicit retry uses the same UUID and exact body.
    await store.save(key, body);
    try { return await acknowledged(store, key, body, verifyReceipt(await api('/listing-reports', { method: 'POST', body }), request, true)); }
    catch (error) { return uncertain(error); }
}
export async function lookupReport(api: ReportApi, store: PendingStore, key: string, value: ReportRequest, digest?: ReportDigest): Promise<ReportResult> {
    const request = parseReportRequest(value), body = JSON.stringify(request);
    // Lookup never sends report evidence, writes, creates a UUID or cancels.
    try { return await acknowledged(store, key, body, verifyReceipt(await api('/listing-reports/receipts/' + request.clientReportId), request, false)); }
    catch (error) {
        // Legacy case endpoint stays compatible. Only an actual case 404 leads
        // to the new minimal receipt lookup; neither GET writes or sends proof.
        if (digest && error instanceof ApiError && error.status === 404) {
            try { return await acknowledgeOperation(await api('/listing-reports/operations/' + request.clientReportId), request, store, key, digest); }
            catch (failure) { return uncertain(failure); }
        }
        return uncertain(error);
    }
}
export async function abandonReport(api: ReportApi, store: PendingStore, key: string, value: ReportRequest, digest: ReportDigest): Promise<ReportResult> {
    const request = parseReportRequest(value), body = JSON.stringify(request);
    // Durable exact journal before the explicit fence. No evidence is sent;
    // accepting an existing RECEIVED receipt is never labelled cancellation.
    await store.save(key, body);
    const requestHash = await reportRequestHash(request, digest);
    try { return await acknowledgeOperation(await api('/listing-reports/operations/' + request.clientReportId + '/abandon', { method: 'POST', body: JSON.stringify({ requestHash }) }), request, store, key, digest); }
    catch (error) { return uncertain(error); }
}
