/// <reference types="node" />
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '../config';
import { abandonListingCreation, listingCreationJournal, listingCreationResult, parseListingCreationJournal, readListingCreation, sendListingCreation, strictCreatedListing } from './listingCreationWeb';
import { pendingRequestKey, type PendingStore } from './webPendingStore';
import hashFixtures from '../../../shared/listing-create-hash-fixtures.json';
const id = '11111111-1111-4111-8111-111111111111', mediaId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-01T00:00:00.000Z', base = API_URL.replace(/\/api\/?$/, '');
const payload = () => ({ clientListingId: id, title: '合成檯燈', description: '僅供測試，並非真實商品。', category: 'home', condition: 'USED', price: 350, currency: 'TWD', mediaIds: [mediaId], deliveryMethods: ['MEETUP'], negotiable: false, location: { county: '臺北市', district: '中山區', latitude: 25.05, longitude: 121.53 }, publish: true, consentToMap: true });
const listing = () => ({ id, ownerUserId: 19, owner: { id: 19, name: '合成賣家' }, title: '後來編輯的合成名稱', description: '後來修改的內容', category: 'home', condition: 'USED', brand: null,
  price: '999', currency: 'TWD', deliveryMethods: ['MEETUP'], negotiable: false, status: 'SOLD', version: 4, expiryMode: 'DEFAULT_30_DAYS',
  createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp, lastVerifiedAt: timestamp, expiresAt: '2026-10-31T00:00:00.000Z',
  location: { county: '臺北市', district: '中山區', publicLatitude: 25.05, publicLongitude: 121.53, precisionMeters: 2200 },
  media: [{ id: mediaId, imageUrl: `${base}/api/listing-media/${mediaId}/image`, thumbnailUrl: `${base}/api/listing-media/${mediaId}/thumbnail`, position: 0, capturePurpose: 'BATCH_ITEM' }] });
async function fixture() { const body = JSON.stringify(payload()), raw = await listingCreationJournal(body), parsed = await parseListingCreationJournal(raw);
  return { body, raw, envelope: { receipt: { clientListingId: id, requestHash: parsed.requestHash, state: 'CREATED', listingId: id, createdAt: timestamp }, listing: listing() } }; }
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
beforeEach(() => vi.restoreAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('web creation journal and immutable receipt contract', () => {
  it.each(hashFixtures)('matches the shared server-verified hash fixture %#', async ({ body, requestHash }) => {
    const parsed = await parseListingCreationJournal(await listingCreationJournal(JSON.stringify(body)));
    expect(parsed.requestHash).toBe(requestHash);
    expect(parsed.payload).toEqual(body);
  });
  it.each([
    { clientListingId: 'invalid' }, { phoneNumber: 'private' }, { price: 350.001 }, { publish: false }, { consentToMap: false },
    { deliveryMethods: ['MEETUP', 'MEETUP'] }, { mediaIds: [mediaId, mediaId] }, { expiryDate: '2030-02-30' },
    { location: { county: '臺北市', district: '中山區', latitude: 25.051234, longitude: 121.531234 } },
  ])('does not persist malformed or precise/private publication input %#', async change => {
    await expect(listingCreationJournal(JSON.stringify({ ...payload(), ...change }))).rejects.toThrow();
  });
  it('binds the entire journal to its original content, and rejects unknown fields', async () => {
    const { raw } = await fixture(); const row = JSON.parse(raw);
    row.payload.price++; await expect(parseListingCreationJournal(JSON.stringify(row))).rejects.toThrow();
    await expect(parseListingCreationJournal(JSON.stringify({ ...JSON.parse(raw), token: 'never-persist' }))).rejects.toThrow();
  });
  it('confirms original creation independently of later title/price/status/version changes', async () => {
    const { raw, envelope } = await fixture();
    const result = await listingCreationResult(envelope, raw, 19);
    expect(result.listing).toMatchObject({ title: '後來編輯的合成名稱', price: 999, status: 'SOLD', version: 4 });
  });
  it('confirms an erased listing without fabricating current public availability', async () => {
    const { raw, envelope } = await fixture(); envelope.listing = null as never;
    expect(await listingCreationResult(envelope, raw, 19)).toEqual({ state: 'CREATED', listingId: id, listing: null });
  });
  it.each(['hash', 'identity', 'owner', 'private-field', 'receipt-field', 'media-field', 'image-origin', 'coordinates', 'state'])('rejects forged or private receipt projection %s', async mutation => {
    const { raw, envelope } = await fixture(); const row = envelope as unknown as { receipt: Record<string, unknown>; listing: Record<string, any> };
    if (mutation === 'hash') row.receipt.requestHash = 'a'.repeat(64);
    if (mutation === 'identity') row.receipt.clientListingId = mediaId;
    if (mutation === 'owner') row.listing.ownerUserId = 20;
    if (mutation === 'private-field') row.listing.password = 'not-allowed';
    if (mutation === 'receipt-field') row.receipt.payload = payload();
    if (mutation === 'media-field') row.listing.media[0].contentHash = 'private';
    if (mutation === 'image-origin') row.listing.media[0].imageUrl = 'https://invalid.example/private';
    if (mutation === 'coordinates') row.listing.location.exactLatitude = 25.051234;
    if (mutation === 'state') row.receipt.state = 'PENDING';
    await expect(listingCreationResult(envelope, raw, 19)).rejects.toThrow();
  });
  it('validates both owner IDs before accepting the native POST acknowledgement', () => {
    const row = listing(); row.owner.id = 20; expect(() => strictCreatedListing(row, 19)).toThrow();
  });
  it('GET recovery never posts, clears or retries', async () => {
    const { raw, envelope } = await fixture(), fetcher = vi.fn(async () => ok(envelope)); vi.stubGlobal('fetch', fetcher);
    await readListingCreation('synthetic-session', raw, 19);
    expect(fetcher).toHaveBeenCalledOnce();
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/creation-receipts/' + id);
    expect(call[1]?.method ?? 'GET').toBe('GET');
  });
  it('requires durable storage and a current account before posting', async () => {
    const { raw } = await fixture(), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const store: PendingStore = { get: vi.fn(), clear: vi.fn(), save: vi.fn(async () => { throw Error('Unavailable'); }) };
    await expect(sendListingCreation('synthetic-session', raw, 19, store, await pendingRequestKey(API_URL, 19, 'listing'), () => true)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    store.save = vi.fn(async () => {});
    await expect(sendListingCreation('synthetic-session', raw, 19, store, 'key', () => false)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps an unknown POST ACK pending, with no automatic resend or clear', async () => {
    const { raw } = await fixture(), fetcher = vi.fn(async () => { throw Error('ACK lost'); }); vi.stubGlobal('fetch', fetcher);
    const store: PendingStore = { get: vi.fn(), clear: vi.fn(), save: vi.fn(async () => {}) };
    await expect(sendListingCreation('synthetic-session', raw, 19, store, 'key', () => true)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce(); expect(store.clear).not.toHaveBeenCalled();
  });
  it('does not read a private receipt after the account changes during POST', async () => {
    const { raw } = await fixture(); let active = true;
    const fetcher = vi.fn(async () => { active = false; return ok(listing()); }); vi.stubGlobal('fetch', fetcher);
    const store: PendingStore = { get: vi.fn(), clear: vi.fn(), save: vi.fn(async () => {}) };
    await expect(sendListingCreation('synthetic-session', raw, 19, store, 'key', () => active)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('cancels with hash only and requires a terminal receipt; does not delete photos', async () => {
    const { raw, envelope } = await fixture(); envelope.receipt.state = 'ABANDONED'; envelope.receipt.listingId = null as never; envelope.listing = null as never;
    const fetcher = vi.fn(async () => ok(envelope)); vi.stubGlobal('fetch', fetcher);
    expect(await abandonListingCreation('synthetic-session', raw, 19, () => true)).toEqual({ state: 'ABANDONED', listingId: null, listing: null });
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/abandon'); expect(call[1].method).toBe('POST'); expect(JSON.parse(String(call[1].body))).toEqual({ requestHash: envelope.receipt.requestHash }); expect(fetcher).toHaveBeenCalledOnce();
  });
});
