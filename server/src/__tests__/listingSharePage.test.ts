import express from 'express';
import path from 'path';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { createListingSharePageRoutes } from '../routes/listingSharePageRoutes';
import type { ListingShareData } from '../lib/listingShareMeta';

jest.mock('../lib/prisma', () => ({ __esModule: true, default: { listing: { findUnique: jest.fn() } } }));

const listingId = 'f1300fe1-ab57-4a4e-aeee-35f9852f36f3';
const photoId = 'ae09254b-1da0-4ac0-9ffc-fe6d34e41658';
const fakeListing = (changes: Partial<ListingShareData> = {}): ListingShareData => ({
    id: listingId, title: '來自北極的禮物', description: '保存良好，歡迎洽詢', condition: 'USED',
    price: new Prisma.Decimal('275'), status: 'ACTIVE', expiresAt: new Date('2027-01-01'), version: 3,
    media: [{ id: photoId, capturePurpose: 'MANUAL_PHOTO' }], ...changes,
});
const app = express();
app.use('/listings', createListingSharePageRoutes(path.resolve(__dirname, '../../../client/index.html')));
const findUnique = prisma.listing.findUnique as jest.Mock;

beforeEach(() => findUnique.mockResolvedValue(fakeListing()));

it('serves each live product’s own name, price and real thumbnail in the initial HTML', async () => {
    const response = await request(app).get(`/listings/${listingId}`).set('User-Agent', 'facebookexternalhit/1.1');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('<meta property="og:title" content="來自北極的禮物｜NT$ 275｜Wishlist.ai" />');
    expect(response.text).toContain('<meta property="og:description" content="二手商品 · NT$ 275 · 保存良好，歡迎洽詢" />');
    expect(response.text).toContain(`<meta property="og:image" content="https://wishlist-app-production.up.railway.app/api/listing-media/${photoId}/thumbnail" />`);
    expect(response.text).toContain(`<meta property="og:url" content="https://wishlist-app-production.up.railway.app/listings/${listingId}?v=3" />`);
    expect(response.text).not.toContain('<meta property="og:image" content="https://wishlist-app-production.up.railway.app/og-image.png" />');
    expect(response.text.match(/<meta property="og:image"/g)).toHaveLength(1);
    expect(response.text).toContain('<div id="root"></div>');
});

it('uses the current public version for both preview caches despite stale or untrusted query parameters', async () => {
    findUnique.mockResolvedValue(fakeListing({ version: 4, title: '已更新的商品', price: new Prisma.Decimal('280.5'), status: 'RESERVED' }));
    const response = await request(app).get(`/listings/${listingId}?v=3&token=SYNTHETIC_PRIVATE_QUERY`);
    expect(response.status).toBe(200);
    expect(response.text).toContain(`<meta property="og:url" content="https://wishlist-app-production.up.railway.app/listings/${listingId}?v=4" />`);
    expect(response.text).toContain(`<meta property="twitter:url" content="https://wishlist-app-production.up.railway.app/listings/${listingId}?v=4" />`);
    expect(response.text).toContain('已更新的商品｜NT$ 280.5');
    expect(response.text).not.toContain('SYNTHETIC_PRIVATE_QUERY');
    expect(response.headers['cache-control']).toBe('no-store');
});

it('prefers an original seller photo over selected AI marketing artwork', async () => {
    findUnique.mockResolvedValue(fakeListing({ media: [
        { id: 'b5509492-26d5-460d-ae47-c281bb313c1c', capturePurpose: 'AI_MARKETING' },
        { id: photoId, capturePurpose: 'MANUAL_PHOTO' },
    ] }));
    const response = await request(app).get(`/listings/${listingId}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain(`/api/listing-media/${photoId}/thumbnail`);
    expect(response.text).not.toContain('b5509492-26d5-460d-ae47-c281bb313c1c');
});

it('escapes user-supplied text and formats free or missing prices honestly', async () => {
    findUnique.mockResolvedValue(fakeListing({ title: '漫畫 "限定" <script>', description: '盒裝 & 附件 <b>完整</b>', price: new Prisma.Decimal('0') }));
    const free = await request(app).get(`/listings/${listingId}`);
    expect(free.text).toContain('漫畫 &quot;限定&quot; &lt;script&gt;｜免費贈送');
    expect(free.text).toContain('盒裝 &amp; 附件 &lt;b&gt;完整&lt;/b&gt;');
    expect(free.text).not.toContain('<script>｜免費贈送');
    findUnique.mockResolvedValue(fakeListing({ price: null }));
    const noPrice = await request(app).get(`/listings/${listingId}`);
    expect(noPrice.text).toContain('來自北極的禮物｜價格洽詢｜Wishlist.ai');
});

it.each([
    ['not found', null],
    ['draft', fakeListing({ status: 'DRAFT' })],
    ['expired', fakeListing({ expiresAt: new Date('2020-01-01') })],
    ['removed', fakeListing({ status: 'REMOVED' })],
    ['sold', fakeListing({ status: 'SOLD' })],
])('does not expose %s product metadata', async (_label, listing) => {
    findUnique.mockResolvedValue(listing);
    const response = await request(app).get(`/listings/${listingId}`);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('來自北極的禮物');
    expect(response.text).toContain('/og-image.png');
});

it.each([0, 2147483648])('fails without product metadata for invalid stored version %s', async version => {
    findUnique.mockResolvedValue(fakeListing({ version }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        const response = await request(app).get(`/listings/${listingId}`);
        expect(response.status).toBe(503);
        expect(response.text).not.toContain('來自北極的禮物');
        expect(response.text).not.toContain(photoId);
    } finally { log.mockRestore(); }
});

it('rejects malformed IDs without querying the database', async () => {
    const response = await request(app).get('/listings/not-a-uuid');
    expect(response.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
});
