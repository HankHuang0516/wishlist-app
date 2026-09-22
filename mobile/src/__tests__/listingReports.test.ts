import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import { createPendingStore } from '../pendingStore';
import { createPrivatePendingIndex } from '../privatePendingIndex';
import { buildReportRequest, lookupReport, parseListingReport, parseReportPage, parseReportRequest, reportPagePath, ReportInputError, submitReport, type ReportRequest } from '../listingReports';

const scope = `wishlist.pending.v1.${'a'.repeat(64)}.42`, key = scope + '.listing-report';
const request = () => buildReportRequest(randomUUID(), randomUUID(), 'FRAUD', '  商品內容不符  ');
const record = (body: ReportRequest) => ({ ...body, details: body.details ?? null, id: randomUUID(), status: 'OPEN', version: 1, createdAt: '2026-09-15T15:00:00.000Z', updatedAt: '2026-09-15T15:00:00.000Z' });
function fixture() {
    const values = new Map<string, string>();
    const port = { get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { values.set(key, value); }), remove: vi.fn(async (key: string) => { values.delete(key); }) };
    const index = createPrivatePendingIndex(port), pending = createPendingStore(index.privateStore, randomUUID);
    return { values, port, index, pending };
}
describe('native private listing-report protocol', () => {
    it('normalizes the exact request without client-controlled authority or state', () => {
        const body = request(); expect(body.details).toBe('商品內容不符');
        expect(parseReportRequest({ ...body, clientReportId: body.clientReportId.toUpperCase(), listingId: body.listingId.toUpperCase() })).toEqual(body);
        expect(buildReportRequest(body.listingId, body.clientReportId, 'OTHER', '   ')).not.toHaveProperty('details');
    });
    it.each([{ reporterUserId: 42 }, { status: 'REMOVED' }, { isAdmin: true }, { requestHash: 'client-controlled' }, { details: 'bad\u0000text' }, { details: 'x'.repeat(1001) }, { reason: 'fraud' }, { clientReportId: 'bad' }, { listingId: 'bad' }])('rejects malformed/overposted report %#', extra => {
        expect(() => parseReportRequest({ ...request(), ...extra })).toThrow(ReportInputError);
    });
    it.each([null, [], '', {}])('rejects invalid request containers %#', value => { expect(() => parseReportRequest(value)).toThrow(ReportInputError); });
    it('parses only bounded private report fields and real ISO times', () => {
        const body = request(); expect(parseListingReport(record(body))).toMatchObject(body);
        expect(parseListingReport({ ...record(body), status: 'REMOVED', version: 2 })).toMatchObject({ status: 'REMOVED', version: 2 });
        expect(parseListingReport(record(buildReportRequest(body.listingId, body.clientReportId, 'OTHER', ''))).details).toBeNull();
    });
    it.each([{ version: 0 }, { version: '1' }, { version: 1.5 }, { version: 2147483648 }, { status: 'unknown' }, { details: undefined }, { createdAt: '2026-02-30T15:00:00.000Z' }, { updatedAt: '2025-09-15T15:00:00.000Z' }, { reporterUserId: 42 }, { password: 'unexpected-field' }])('rejects malformed/private-extra receipt %#', extra => {
        expect(() => parseListingReport({ ...record(request()), ...extra })).toThrow(ReportInputError);
    });
    it('requires bounded, unique, forward-anchored pages', () => {
        const items = Array.from({ length: 25 }, () => record(request()));
        expect(parseReportPage({ items, nextCursor: items[24].id }).items).toHaveLength(25);
        expect(parseReportPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
        for (const value of [{ items: [...items, record(request())], nextCursor: null }, { items: [items[0], items[0]], nextCursor: null }, { items: [items[0]], nextCursor: items[0].id }, { items, nextCursor: randomUUID() }, { items: [], nextCursor: undefined }, { items: 'bad', nextCursor: null }]) expect(() => parseReportPage(value)).toThrow(ReportInputError);
        expect(reportPagePath()).toBe('/listing-reports/mine'); expect(reportPagePath(items[24].id)).toBe('/listing-reports/mine?cursor=' + items[24].id);
        expect(() => reportPagePath('not-a-uuid')).toThrow(ReportInputError);
    });
    it('commits the encrypted journal and exact index hints before issuing HTTP', async () => {
        const { pending, port } = fixture(), body = request();
        const api = vi.fn(async (_path: string, options?: RequestInit) => {
            expect(await pending.get(key)).toBe(JSON.stringify(body));
            expect(port.set.mock.calls.some(call => call[0] === key)).toBe(true);
            expect(options?.body).toBe(JSON.stringify(body)); return { report: record(body), replayed: false };
        });
        const result = await submitReport(api, pending, key, body); expect(result).toMatchObject({ kind: 'confirmed', pendingCleared: true });
        expect(api).toHaveBeenCalledTimes(1); expect(await pending.get(key)).toBeNull();
    });
    it('never contacts HTTP if secure persistence fails', async () => {
        const { pending, port } = fixture(), api = vi.fn(); port.set.mockRejectedValueOnce(new Error('storage unavailable'));
        await expect(submitReport(api, pending, key, request())).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
    });
    it('retains an unknown POST result and retries only the same UUID/body on explicit invocation', async () => {
        const { pending } = fixture(), body = request(), api = vi.fn().mockRejectedValueOnce(new Error('lost ACK')).mockResolvedValueOnce({ report: record(body), replayed: true });
        expect(await submitReport(api, pending, key, body)).toMatchObject({ kind: 'unconfirmed' }); expect(api).toHaveBeenCalledTimes(1); expect(await pending.get(key)).toBe(JSON.stringify(body));
        expect(await submitReport(api, pending, key, body)).toMatchObject({ kind: 'confirmed' });
        expect(api.mock.calls.map(call => call[1].body)).toEqual([JSON.stringify(body), JSON.stringify(body)]);
    });
    it('refuses a different request while an unknown journal is still committed', async () => {
        const { pending } = fixture(), old = request(), api = vi.fn(); await pending.save(key, JSON.stringify(old));
        await expect(submitReport(api, pending, key, request())).rejects.toThrow(); expect(api).not.toHaveBeenCalled(); expect(await pending.get(key)).toBe(JSON.stringify(old));
    });
    it.each([401, 403, 404, 409, 500])('lookup %i is not success or cancellation and never sends evidence/POST', async status => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body));
        const api = vi.fn(async () => { throw new ApiError(status); });
        expect(await lookupReport(api, pending, key, body)).toMatchObject({ kind: 'unconfirmed' });
        expect(api.mock.calls).toEqual([['/listing-reports/receipts/' + body.clientReportId]]); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it.each(['clientReportId', 'listingId', 'reason', 'details'])('rejects an ACK for mismatched %s without clearing the original', async field => {
        const { pending } = fixture(), body = request(), wrong = { ...record(body), [field]: field === 'reason' ? 'OTHER' : field === 'details' ? 'different' : randomUUID() };
        const api = vi.fn(async () => ({ report: wrong, replayed: false }));
        expect(await submitReport(api, pending, key, body)).toMatchObject({ kind: 'unconfirmed' }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('requires the actual ACK shape rather than accepting a fabricated success flag', async () => {
        const { pending } = fixture(), body = request(), api = vi.fn(async () => ({ success: true }));
        expect(await submitReport(api, pending, key, body)).toMatchObject({ kind: 'unconfirmed' }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('reads and acknowledges the original processed receipt without resending or downgrading status', async () => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body));
        const api = vi.fn(async () => ({ report: { ...record(body), status: 'REMOVED', version: 2 } }));
        expect(await lookupReport(api, pending, key, body)).toMatchObject({ kind: 'confirmed', report: { status: 'REMOVED' }, pendingCleared: true }); expect(api).toHaveBeenCalledTimes(1);
    });
    it('preserves a known server ACK if clearing the device marker fails', async () => {
        const { pending, port } = fixture(), body = request(), api = vi.fn(async () => ({ report: record(body), replayed: false }));
        port.remove.mockRejectedValueOnce(new Error('marker removal failed'));
        expect(await submitReport(api, pending, key, body)).toMatchObject({ kind: 'confirmed', pendingCleared: false }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('never clears a newer journal when an old receipt arrives late', async () => {
        const { pending } = fixture(), old = request(), newer = request(); await pending.save(key, JSON.stringify(newer));
        const api = vi.fn(async () => ({ report: record(old) }));
        expect(await lookupReport(api, pending, key, old)).toMatchObject({ kind: 'confirmed', pendingCleared: false }); expect(await pending.get(key)).toBe(JSON.stringify(newer));
    });
    it('recognizes an already-absent marker without touching other owner data', async () => {
        const { pending } = fixture(), body = request(), otherKey = scope + '.wish-create'; await pending.save(otherKey, 'unrelated-wish');
        expect(await lookupReport(vi.fn(async () => ({ report: record(body) })), pending, key, body)).toMatchObject({ kind: 'confirmed', pendingCleared: true }); expect(await pending.get(otherKey)).toBe('unrelated-wish');
    });
    it('includes report chunks in physical account cleanup and fences later report writes', async () => {
        const { pending, index, values, port } = fixture(), body = buildReportRequest(randomUUID(), randomUUID(), 'OTHER', '合成證據'.repeat(180));
        await pending.save(key, JSON.stringify(body)); const otherKey = `wishlist.pending.v1.${'b'.repeat(64)}.42.listing-report`; await pending.save(otherKey, 'other-service');
        expect([...values.keys()].filter(name => name.startsWith(key)).length).toBeGreaterThan(2);
        expect(await index.erase(scope)).toEqual({ remaining: 0 }); expect([...values.keys()].filter(name => name.startsWith(scope))).toEqual([]); expect(await pending.get(otherKey)).toBe('other-service');
        const restarted = createPendingStore(createPrivatePendingIndex(port).privateStore, randomUUID);
        await expect(restarted.save(key, JSON.stringify(body))).rejects.toThrow(); expect(await restarted.get(key)).toBeNull();
    });
});
