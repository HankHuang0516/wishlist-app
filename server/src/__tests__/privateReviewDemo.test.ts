import { randomUUID } from 'crypto';
import { canViewPrivateReviewListing, isPrivateReviewRoom, privateReviewListingIds, privateReviewTitleAllowed } from '../lib/privateReviewDemo';

const previous = process.env.PRIVATE_REVIEW_DEMO_ROOMS;
afterEach(() => { if (previous === undefined) delete process.env.PRIVATE_REVIEW_DEMO_ROOMS; else process.env.PRIVATE_REVIEW_DEMO_ROOMS = previous; });
const fixture = () => ({ conversationId: randomUUID(), listingId: randomUUID(), buyerUserId: 11, sellerUserId: 12 });

it('does not grant demonstration capabilities for absent or malformed operator configuration', () => {
    for (const raw of [undefined, '', 'null', '{}', '[null]', '{bad json', '[1]', 'x'.repeat(6001)]) {
        if (raw === undefined) delete process.env.PRIVATE_REVIEW_DEMO_ROOMS; else process.env.PRIVATE_REVIEW_DEMO_ROOMS = raw;
        expect(privateReviewListingIds()).toEqual([]);
    }
});

it('rejects the whole configuration when one tuple is ambiguous, spoofable or incomplete', () => {
    const f = fixture();
    for (const entries of [[f, f], [f, { ...fixture(), listingId: f.listingId }], [{ ...f, buyerUserId: f.sellerUserId }],
        [{ ...f, sellerUserId: '12' }], [{ ...f, buyerUserId: -1 }], [{ ...f, listingId: 'invalid' }], [{ ...f, allowAll: true }],
        Array.from({ length: 11 }, fixture)]) {
        process.env.PRIVATE_REVIEW_DEMO_ROOMS = JSON.stringify(entries);
        expect(privateReviewListingIds()).toEqual([]);
    }
});

it('confines capability to the exact pre-existing pair, product, room and non-sale marker', () => {
    const f = fixture(); process.env.PRIVATE_REVIEW_DEMO_ROOMS = JSON.stringify([f]);
    const room = { id: f.conversationId, listingId: f.listingId, buyerUserId: 11, sellerUserId: 12, archivedAt: null };
    const listing = { id: f.listingId, ownerUserId: 12, title: '【QA測試非販售】審查示範' };
    expect(isPrivateReviewRoom(room, listing)).toBe(true);
    for (const changed of [{ ...room, id: randomUUID() }, { ...room, listingId: randomUUID() },
        { ...room, buyerUserId: 13 }, { ...room, sellerUserId: 13 }, { ...room, archivedAt: new Date() }])
        expect(isPrivateReviewRoom(changed, listing)).toBe(false);
    expect(isPrivateReviewRoom(room, { ...listing, ownerUserId: 13 })).toBe(false);
    expect(isPrivateReviewRoom(room, { ...listing, title: '普通商品' })).toBe(false);
    expect(isPrivateReviewRoom(room, null)).toBe(false);
    for (const id of [11, 12]) expect(canViewPrivateReviewListing(listing, id)).toBe(true);
    for (const id of [undefined, 13]) expect(canViewPrivateReviewListing(listing, id)).toBe(false);
    expect(privateReviewTitleAllowed(f.listingId, '普通商品')).toBe(false);
    expect(privateReviewTitleAllowed(f.listingId, listing.title)).toBe(true);
    expect(privateReviewTitleAllowed(randomUUID(), '普通商品')).toBe(true);
});
