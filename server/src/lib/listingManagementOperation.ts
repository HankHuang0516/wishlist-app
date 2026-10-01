import { createHash } from 'node:crypto';
import { isListingId, ListingInputError } from './listingRules';

export function managementId(value: unknown): string {
    if (!isListingId(value)) throw new ListingInputError('clientActionId');
    return value.toLowerCase();
}
function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingInputError('body');
    return value as Record<string, unknown>;
}
const exact = (row: Record<string, unknown>, keys: string[]) => {
    if (Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) throw new ListingInputError('body');
};
export function managementBody(value: unknown) {
    const row = record(value); exact(row, ['kind', 'listingId', 'expectedVersion', 'changes']);
    if (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1 || Number(row.expectedVersion) > 2147483646) throw new ListingInputError('expectedVersion');
    const listingId = managementId(row.listingId), expectedVersion = Number(row.expectedVersion), changes = record(row.changes);
    let normalized: Record<string, unknown>;
    if (row.kind === 'EDIT') {
        if (!Object.prototype.hasOwnProperty.call(changes, 'title') || Object.keys(changes).some(key => !['title', 'description', 'price'].includes(key))) throw new ListingInputError('changes');
        if (typeof changes.title !== 'string' || !changes.title.trim() || changes.title.length > 100 ||
            (changes.description !== undefined && (typeof changes.description !== 'string' || !changes.description.trim() || changes.description.length > 3000)) ||
            (changes.price !== undefined && (typeof changes.price !== 'number' || !Number.isFinite(changes.price) || changes.price < 0 || changes.price > 9999999999.99 || Math.abs(changes.price * 100 - Math.round(changes.price * 100)) > 0.001))) throw new ListingInputError('changes');
        for (const value of [changes.title, changes.description]) if (typeof value === 'string' && Buffer.from(value).toString('utf8') !== value) throw new ListingInputError('changes');
        normalized = { title: changes.title.trim(), ...(changes.description !== undefined ? { description: (changes.description as string).trim() } : {}), ...(changes.price !== undefined ? { price: changes.price } : {}) };
    } else if (row.kind === 'STATUS') {
        exact(changes, ['action']);
        if (!['reserve', 'release', 'sold', 'remove'].includes(String(changes.action)) || typeof changes.action !== 'string') throw new ListingInputError('action');
        normalized = { action: changes.action };
    } else if (row.kind === 'EXTEND') {
        exact(changes, ['expiryDate']);
        const date = changes.expiryDate;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new ListingInputError('expiryDate');
        normalized = { expiryDate: date };
    } else throw new ListingInputError('kind');
    return { kind: row.kind as 'EDIT' | 'STATUS' | 'EXTEND', listingId, expectedVersion, changes: normalized };
}
export function managementHash(body: ReturnType<typeof managementBody>) { return createHash('sha256').update(JSON.stringify(body)).digest('hex'); }
export function managementAbandonBody(value: unknown) {
    const row = record(value); exact(row, ['kind', 'listingId', 'expectedVersion', 'requestHash']);
    if (typeof row.kind !== 'string' || !['EDIT', 'STATUS', 'EXTEND'].includes(row.kind) || !Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1 || Number(row.expectedVersion) > 2147483646 || typeof row.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.requestHash)) throw new ListingInputError('body');
    return { kind: row.kind as 'EDIT' | 'STATUS' | 'EXTEND', listingId: managementId(row.listingId), expectedVersion: Number(row.expectedVersion), requestHash: row.requestHash };
}
