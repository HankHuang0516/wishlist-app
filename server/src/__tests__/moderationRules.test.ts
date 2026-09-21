import { randomUUID } from 'crypto';
import { ModerationInputError, parseListingReport, parseModerationDecision, parseReportPage, parseReportAbandonment } from '../lib/moderationRules';

const reportId = randomUUID();
const report = () => ({ clientReportId: randomUUID(), listingId: randomUUID(), reason: 'FRAUD', details: '  內容不符  ' });
const decision = () => ({ clientDecisionId: randomUUID(), decision: 'REMOVE_LISTING', notes: ' 人工審核商品 ', expectedReportVersion: 1, expectedListingVersion: 3 });
describe('strict private moderation inputs', () => {
    it('accepts only an exact minimal hash for explicit abandonment', () => {
        const requestHash = parseListingReport(report()).requestHash;
        expect(parseReportAbandonment({ requestHash })).toEqual({ requestHash });
        for (const value of [null, [], {}, { requestHash: requestHash.toUpperCase() }, { requestHash: 'bad' }, { requestHash, reporterUserId: 1 }, { requestHash, details: 'private' }, { requestHash: [requestHash] }]) expect(() => parseReportAbandonment(value)).toThrow(ModerationInputError);
    });
    it('rejects unpaired UTF-16 surrogates without rejecting valid emoji', () => {
        for (const details of ['bad\ud800text', 'bad\udc00text']) expect(() => parseListingReport({ ...report(), details })).toThrow(ModerationInputError);
        expect(parseListingReport({ ...report(), details: '商品📦狀況' }).details).toBe('商品📦狀況');
    });
    it('normalizes public UUIDs and whitespace and produces stable payload hashes', () => {
        const body = report(), parsed = parseListingReport(body);
        expect(parsed.details).toBe('內容不符');
        expect(parseListingReport({ ...body, clientReportId: body.clientReportId.toUpperCase(), listingId: body.listingId.toUpperCase(), details: '內容不符' })).toEqual(parsed);
        expect(parsed.requestHash).toMatch(/^[a-f0-9]{64}$/);
    });
    it('allows a reason without a fabricated evidence field', () => {
        const { details, ...body } = report(); expect(parseListingReport(body).details).toBeNull();
    });
    it.each([{ reporterUserId: 1 }, { isAdmin: true }, { status: 'REMOVED' }, { requestHash: 'client-controlled' }, { version: 5 }])('rejects report ownership/state overposting %#', extra => {
        expect(() => parseListingReport({ ...report(), ...extra })).toThrow(ModerationInputError);
    });
    it.each([null, [], 'body', { clientReportId: undefined }, { listingId: 'not-a-uuid' }, { reason: 'fraud' }, { reason: ['FRAUD'] }, { details: '' }, { details: 'a'.repeat(1001) }, { details: 'bad\u0000text' }])('rejects malformed report %#', value => {
        expect(() => parseListingReport(value && !Array.isArray(value) && typeof value === 'object' ? { ...report(), ...value } : value)).toThrow(ModerationInputError);
    });
    it('binds decision hashes to the route case, not just the body', () => {
        const body = decision(), parsed = parseModerationDecision(body, reportId);
        expect(parsed.notes).toBe('人工審核商品');
        expect(parseModerationDecision(body, randomUUID()).requestHash).not.toBe(parsed.requestHash);
    });
    it('requires the listing version for removal and forbids it for dismissal', () => {
        const body = decision();
        expect(() => parseModerationDecision({ ...body, expectedListingVersion: undefined }, reportId)).toThrow(ModerationInputError);
        expect(() => parseModerationDecision({ ...body, decision: 'DISMISS' }, reportId)).toThrow(ModerationInputError);
        expect(parseModerationDecision({ ...body, decision: 'DISMISS', expectedListingVersion: undefined }, reportId).expectedListingVersion).toBeNull();
    });
    it.each([0, -1, 1.5, '1', 2_147_483_647, 2_147_483_648, null])('rejects invalid optimistic versions %p', value => {
        expect(() => parseModerationDecision({ ...decision(), expectedReportVersion: value }, reportId)).toThrow(ModerationInputError);
        expect(() => parseModerationDecision({ ...decision(), expectedListingVersion: value }, reportId)).toThrow(ModerationInputError);
    });
    it('fixes page size and rejects query credentials, arrays and unknown status', () => {
        expect(parseReportPage({})).toEqual({ cursor: undefined, status: undefined, limit: 25 });
        for (const value of [{ limit: '1000' }, { key: 'url-secret' }, { status: ['OPEN'] }, { status: 'unknown' }, { cursor: 'fake' }]) expect(() => parseReportPage(value)).toThrow(ModerationInputError);
    });
});
