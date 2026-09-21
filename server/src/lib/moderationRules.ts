import { createHash } from 'crypto';
import { isListingId } from './listingRules';

export class ModerationInputError extends Error {}
export const REPORT_REASONS = ['PROHIBITED', 'FRAUD', 'HARASSMENT', 'SPAM', 'OTHER'] as const;
export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'REMOVED'] as const;
export function moderationObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModerationInputError();
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some(key => !keys.includes(key))) throw new ModerationInputError();
    return body;
}
export function moderationId(value: unknown): string {
    if (!isListingId(value)) throw new ModerationInputError();
    return value.toLowerCase();
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
function text(value: unknown) {
    if (typeof value !== 'string' || !wellFormed(value) || !value.trim() || value.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ModerationInputError();
    return value.trim();
}
function version(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2_147_483_646) throw new ModerationInputError();
    return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseReportAbandonment(value: unknown) {
    const body = moderationObject(value, ['requestHash']);
    if (typeof body.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.requestHash)) throw new ModerationInputError();
    return { requestHash: body.requestHash };
}
export function parseListingReport(value: unknown) {
    const body = moderationObject(value, ['clientReportId', 'listingId', 'reason', 'details']);
    const clientReportId = moderationId(body.clientReportId), listingId = moderationId(body.listingId);
    if (!(REPORT_REASONS as readonly unknown[]).includes(body.reason)) throw new ModerationInputError();
    const reason = body.reason as typeof REPORT_REASONS[number];
    const details = body.details === undefined ? null : text(body.details);
    return { clientReportId, listingId, reason, details, requestHash: hash({ listingId, reason, details }) };
}
export function parseModerationDecision(value: unknown, reportId: string) {
    const body = moderationObject(value, ['clientDecisionId', 'decision', 'notes', 'expectedReportVersion', 'expectedListingVersion']);
    const clientDecisionId = moderationId(body.clientDecisionId), expectedReportVersion = version(body.expectedReportVersion), notes = text(body.notes);
    if (body.decision !== 'DISMISS' && body.decision !== 'REMOVE_LISTING') throw new ModerationInputError();
    const decision: 'DISMISS' | 'REMOVE_LISTING' = body.decision;
    if (decision === 'DISMISS' && body.expectedListingVersion !== undefined) throw new ModerationInputError();
    const expectedListingVersion = decision === 'REMOVE_LISTING' ? version(body.expectedListingVersion) : null;
    return { clientDecisionId, decision, notes, expectedReportVersion, expectedListingVersion,
        requestHash: hash({ reportId: moderationId(reportId), decision, notes, expectedReportVersion, expectedListingVersion }) };
}
export function parseReportPage(value: unknown) {
    const query = moderationObject(value, ['cursor', 'status']);
    if (query.status !== undefined && !(REPORT_STATUSES as readonly unknown[]).includes(query.status)) throw new ModerationInputError();
    return { cursor: query.cursor === undefined ? undefined : moderationId(query.cursor), status: query.status as typeof REPORT_STATUSES[number] | undefined, limit: 25 };
}
