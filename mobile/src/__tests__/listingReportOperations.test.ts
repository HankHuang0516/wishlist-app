import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseListingReport as serverReport } from '../../../server/src/lib/moderationRules';
import { ApiError } from '../api';
import { createPendingStore } from '../pendingStore';
import { abandonReport, buildReportRequest, lookupReport, parseReportRequest, reportRequestHash, type ReportRequest } from '../listingReports';

const key = 'wishlist.pending.v1.' + 'a'.repeat(64) + '.42.listing-report';
const digest = async (value: string) => createHash('sha256').update(value).digest('hex');
const request = () => buildReportRequest(randomUUID(), randomUUID(), 'FRAUD', '商品📦內容不符');
const receipt = (body: ReportRequest, state = 'RECEIVED', report: unknown = null) => ({ operation: { clientReportId: body.clientReportId, requestHash: serverReport(body).requestHash, state, createdAt: '2026-09-15T15:00:00.000Z' }, report });
const record = (body: ReportRequest) => ({ ...body, details: body.details ?? null, id: randomUUID(), status: 'OPEN', version: 1, createdAt: '2026-09-15T15:00:00.000Z', updatedAt: '2026-09-15T15:00:00.000Z' });
function fixture() {
    const values = new Map<string, string>();
    const port = { get: vi.fn(async (name: string) => values.get(name) ?? null), set: vi.fn(async (name: string, value: string) => { values.set(name, value); }), remove: vi.fn(async (name: string) => { values.delete(name); }) };
    return { port, pending: createPendingStore(port, randomUUID) };
}
describe('minimal native report receipts and explicit abandonment', () => {
    it('matches the actual server canonical hash with emoji, normalization and absent details', async () => {
        const body = request();
        for (const input of [body, { ...body, details: undefined }, { ...body, details: '  商品📦內容不符  ', listingId: body.listingId.toUpperCase() }]) expect(await reportRequestHash(input, digest)).toBe(serverReport(input).requestHash);
        expect(await reportRequestHash({ ...body, clientReportId: randomUUID() }, digest)).toBe(await reportRequestHash(body, digest));
        expect(await reportRequestHash({ ...body, reason: 'OTHER' }, digest)).not.toBe(await reportRequestHash(body, digest));
    });
    it('rejects unpaired surrogates before storage or network', async () => {
        const { pending } = fixture(), api = vi.fn();
        for (const details of ['bad\ud800text', 'bad\udc00text', 'bad\ud800']) {
            const body = { ...request(), details }; expect(() => parseReportRequest(body)).toThrow();
            await expect(abandonReport(api, pending, key, body, digest)).rejects.toThrow();
        }
        expect(api).not.toHaveBeenCalled();
    });
    it('recovers target-gone acceptance only through a matching minimal receipt, using GETs only', async () => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body));
        const api = vi.fn().mockRejectedValueOnce(new ApiError(404)).mockResolvedValueOnce(receipt(body));
        expect(await lookupReport(api, pending, key, body, digest)).toEqual({ kind: 'received-without-case', pendingCleared: true });
        expect(api.mock.calls).toEqual([['/listing-reports/receipts/' + body.clientReportId], ['/listing-reports/operations/' + body.clientReportId]]);
        expect(await pending.get(key)).toBeNull();
    });
    it('recovers a previously accepted abandonment without resending an operation', async () => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body));
        const api = vi.fn().mockRejectedValueOnce(new ApiError(404)).mockResolvedValueOnce(receipt(body, 'ABANDONED'));
        expect(await lookupReport(api, pending, key, body, digest)).toMatchObject({ kind: 'abandoned', pendingCleared: true });
        expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
    });
    it.each([401, 403, 409, 500])('does not use a case %i to bypass admission through the fallback', async status => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body)); const api = vi.fn().mockRejectedValue(new ApiError(status));
        expect(await lookupReport(api, pending, key, body, digest)).toMatchObject({ kind: 'unconfirmed' }); expect(api).toHaveBeenCalledTimes(1); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it.each([404, 401, 409, 500])('minimal receipt %i is neither confirmation nor cancellation', async status => {
        const { pending } = fixture(), body = request(); await pending.save(key, JSON.stringify(body));
        const api = vi.fn().mockRejectedValueOnce(new ApiError(404)).mockRejectedValueOnce(new ApiError(status));
        expect(await lookupReport(api, pending, key, body, digest)).toMatchObject({ kind: 'unconfirmed' }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it.each([{ requestHash: '0'.repeat(64) }, { state: 'UNKNOWN' }, { createdAt: 'bad' }, { clientReportId: randomUUID() }, { reporterUserId: 42 }])('rejects malformed or wrong-body minimal receipt %#', async extra => {
        const { pending } = fixture(), body = request(), original = receipt(body); await pending.save(key, JSON.stringify(body));
        const api = vi.fn().mockRejectedValueOnce(new ApiError(404)).mockResolvedValueOnce({ ...original, operation: { ...original.operation, ...extra } });
        expect(await lookupReport(api, pending, key, body, digest)).toMatchObject({ kind: 'unconfirmed' }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('saves the exact original before fencing, sends only its hash and preserves the same UUID', async () => {
        const { pending } = fixture(), body = request();
        const api = vi.fn(async (_path: string, options?: RequestInit) => { expect(await pending.get(key)).toBe(JSON.stringify(body)); expect(JSON.parse(options!.body as string)).toEqual({ requestHash: serverReport(body).requestHash }); return receipt(body, 'ABANDONED'); });
        expect(await abandonReport(api, pending, key, body, digest)).toEqual({ kind: 'abandoned', pendingCleared: true });
        expect(api).toHaveBeenCalledTimes(1); expect(api.mock.calls[0][0]).toBe('/listing-reports/operations/' + body.clientReportId + '/abandon');
    });
    it('never falsely cancels a received case when abandonment loses the race', async () => {
        const { pending } = fixture(), body = request(), report = record(body), api = vi.fn().mockResolvedValue(receipt(body, 'RECEIVED', report));
        expect(await abandonReport(api, pending, key, body, digest)).toMatchObject({ kind: 'confirmed', report, pendingCleared: true });
        expect(await abandonReport(vi.fn().mockResolvedValue(receipt(body)), pending, key, body, digest)).toMatchObject({ kind: 'received-without-case' });
    });
    it('rejects a contradictory abandoned receipt carrying a case, without clearing evidence', async () => {
        const { pending } = fixture(), body = request(), api = vi.fn().mockResolvedValue(receipt(body, 'ABANDONED', record(body)));
        expect(await abandonReport(api, pending, key, body, digest)).toMatchObject({ kind: 'unconfirmed' }); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('retains unknown abandonment after a lost ACK and allows only explicit same-key lookup recovery', async () => {
        const { pending } = fixture(), body = request(), api = vi.fn().mockRejectedValue(new Error('lost ACK'));
        expect(await abandonReport(api, pending, key, body, digest)).toMatchObject({ kind: 'unconfirmed' }); expect(api).toHaveBeenCalledTimes(1); expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
    it('fails before HTTP on persistence/hash errors and refuses replacing another pending operation', async () => {
        const { pending, port } = fixture(), body = request(), api = vi.fn();
        port.set.mockRejectedValueOnce(new Error('disk unavailable')); await expect(abandonReport(api, pending, key, body, digest)).rejects.toThrow();
        await expect(abandonReport(api, pending, key, body, async () => 'BAD')).rejects.toThrow();
        await expect(abandonReport(api, pending, key, request(), digest)).rejects.toThrow(); expect(api).not.toHaveBeenCalled();
    });
    it('does not clear a newer journal when an older minimal receipt arrives', async () => {
        const { pending } = fixture(), old = request(), newer = request(); await pending.save(key, JSON.stringify(newer));
        const api = vi.fn().mockRejectedValueOnce(new ApiError(404)).mockResolvedValueOnce(receipt(old));
        expect(await lookupReport(api, pending, key, old, digest)).toMatchObject({ kind: 'received-without-case', pendingCleared: false }); expect(await pending.get(key)).toBe(JSON.stringify(newer));
    });
    it('preserves proven terminal state if device marker cleanup fails', async () => {
        const { pending, port } = fixture(), body = request(); port.remove.mockRejectedValueOnce(new Error('storage unavailable'));
        expect(await abandonReport(vi.fn().mockResolvedValue(receipt(body, 'ABANDONED')), pending, key, body, digest)).toEqual({ kind: 'abandoned', pendingCleared: false });
        expect(await pending.get(key)).toBe(JSON.stringify(body));
    });
});
