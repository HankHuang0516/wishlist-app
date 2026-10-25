import { NON_SALE_QA_PREFIX, isExplicitNonSaleFixture } from './listingRules';

type DemoRoom = { conversationId: string; listingId: string; buyerUserId: number; sellerUserId: number };
type RoomIdentity = { id: string; listingId: string | null; buyerUserId: number | null; sellerUserId: number | null; archivedAt: Date | null };
type ListingIdentity = { id: string; ownerUserId: number; title: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
let lastConfig: string | undefined;
let rooms: DemoRoom[] = [];

// Explicit operator configuration of existing synthetic pairs, disabled by
// default. No request body, display name or email can opt a user into this mode.
function configuredRooms(): DemoRoom[] {
    const raw = process.env.PRIVATE_REVIEW_DEMO_ROOMS;
    if (raw === lastConfig) return rooms;
    lastConfig = raw; rooms = [];
    if (!raw || raw.length > 6000) return rooms;
    try {
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value) || value.length > 10) return rooms;
        const seenRooms = new Set<string>(), seenListings = new Set<string>();
        const valid = value.every(r => r && typeof r === 'object' && !Array.isArray(r) &&
            Object.keys(r).sort().join(',') === 'buyerUserId,conversationId,listingId,sellerUserId' &&
            typeof r.conversationId === 'string' && uuid.test(r.conversationId) &&
            typeof r.listingId === 'string' && uuid.test(r.listingId) &&
            [r.buyerUserId, r.sellerUserId].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647) &&
            r.buyerUserId !== r.sellerUserId && !seenRooms.has(r.conversationId) && !seenListings.has(r.listingId) &&
            !!seenRooms.add(r.conversationId) && !!seenListings.add(r.listingId));
        if (valid) rooms = value;
    } catch { /* Invalid configuration leaves the ordinary non-sale restriction intact. */ }
    return rooms;
}

export function privateReviewListingIds(): string[] { return configuredRooms().map(r => r.listingId); }

// This is a capability check AFTER ordinary authenticated room membership,
// account existence, pair locks, block and lifecycle checks; never authorization.
export function isPrivateReviewRoom(room: RoomIdentity, listing: ListingIdentity | null): boolean {
    return !room.archivedAt && !!listing && isExplicitNonSaleFixture(listing.title) && configuredRooms().some(r =>
        r.conversationId === room.id && r.listingId === room.listingId && r.listingId === listing.id &&
        r.buyerUserId === room.buyerUserId && r.sellerUserId === room.sellerUserId && listing.ownerUserId === r.sellerUserId);
}

export function canViewPrivateReviewListing(listing: ListingIdentity, viewerId: number | undefined): boolean {
    return viewerId !== undefined && isExplicitNonSaleFixture(listing.title) && configuredRooms().some(r =>
        r.listingId === listing.id && r.sellerUserId === listing.ownerUserId && [r.buyerUserId, r.sellerUserId].includes(viewerId));
}

export function privateReviewTitleAllowed(id: string, title: string): boolean {
    return !privateReviewListingIds().includes(id) || title.startsWith(NON_SALE_QA_PREFIX);
}
