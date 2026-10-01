import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { parseListingSellerDraft, ListingSellerDraftError } from './listingSellerDraft';
import { listingCreationId } from './listingCreation';

export function sellerDraftPayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'draft,expectedVersion') throw new ListingSellerDraftError();
    const row = value as Record<string, unknown>;
    if (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 0 || Number(row.expectedVersion) > 1000000) throw new ListingSellerDraftError();
    const draft = parseListingSellerDraft(row.draft);
    // Canonical order must agree with the browser, not the input key order.
    draft.clientListingId = listingCreationId(draft.clientListingId);
    draft.touched = Object.fromEntries(Object.entries(draft.touched).sort(([a], [b]) => a.localeCompare(b))) as typeof draft.touched;
    return { expectedVersion: Number(row.expectedVersion), draft };
}
export function sellerDraftHash(mediaId: string, payload: ReturnType<typeof sellerDraftPayload>) {
    return createHash('sha256').update(JSON.stringify({ mediaId, ...payload })).digest('hex');
}
export const sellerDraftReceiptSelect = {
    clientActionId: true, mediaId: true, requestHash: true, state: true, appliedVersion: true, createdAt: true,
} satisfies Prisma.SellerDraftReceiptSelect;
export const sellerDraftMediaSelect = {
    id: true, ownerUserId: true, listingId: true, wishItemId: true, capturePurpose: true, sellerDraft: true, sellerDraftVersion: true,
} satisfies Prisma.ListingMediaSelect;
