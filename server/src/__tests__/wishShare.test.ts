import express from 'express';
import path from 'path';
import { createLoopbackRequest } from './integration/loopbackHttp';
import prisma from '../lib/prisma';
import { readSharedWish, readWishShareToken, wishSharePath, wishShareToken } from '../lib/wishShare';
import { createSharedWishRoutes } from '../routes/sharedWishRoutes';
import { createSharePageRoutes } from '../routes/sharePageRoutes';
import { catalogProduct, catalogReady } from '../lib/publicCatalog';

jest.mock('../lib/prisma', () => ({ __esModule: true, default: { item: { findUnique: jest.fn() } } }));
jest.mock('../lib/publicCatalog', () => ({ __esModule: true, catalogReady: jest.fn(), catalogProduct: jest.fn() }));

const findUnique = prisma.item.findUnique as jest.Mock, ready = catalogReady as jest.Mock, product = catalogProduct as jest.Mock;
const site = 'https://wishlist-app-production.up.railway.app';
const app = express();
app.use('/api/shared-wishes', createSharedWishRoutes());
app.use(createSharePageRoutes(path.resolve(__dirname, '../../../client/index.html')));
app.use((_req, res) => { res.status(200).type('html').send('ORDINARY_PAGE'); });
const http = createLoopbackRequest(app);
const productId = 'f1300fe1-ab57-4a4e-aeee-35f9852f36f3';

beforeEach(() => { process.env.JWT_SECRET = 'wish-share-unit-test-only'; findUnique.mockReset(); ready.mockReset().mockResolvedValue(true); product.mockReset(); });

describe('the address of a shared wish', () => {
    it('is one fixed token per wish that shows no number and only this server can read back', () => {
        const token = wishShareToken(123456789);
        expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(token).not.toContain('123456789');
        expect(wishShareToken(123456789)).toBe(token);
        expect(wishShareToken(123456790)).not.toBe(token);
        expect(readWishShareToken(token)).toBe(123456789);
        expect(wishSharePath(7)).toBe('/shared-wishes/' + wishShareToken(7));
        for (const id of [1, 2147483647]) expect(readWishShareToken(wishShareToken(id))).toBe(id);
        for (const bad of [0, -1, 1.5, 2147483648, Number.NaN]) expect(() => wishShareToken(bad)).toThrow();
    });
    it('refuses a token it did not make: altered, guessed, another length, or sealed with another key', () => {
        const token = wishShareToken(42);
        for (let index = 0; index < token.length; index++) {
            const changed = token.slice(0, index) + (token[index] === 'A' ? 'B' : 'A') + token.slice(index + 1);
            expect(readWishShareToken(changed)).toBeNull();
        }
        for (const bad of ['', '42', token + 'A', token.slice(1), 'A'.repeat(22), '!'.repeat(22), null, undefined, 42, [token]]) expect(readWishShareToken(bad)).toBeNull();
        process.env.JWT_SECRET = 'another-server-secret';
        expect(readWishShareToken(token)).toBeNull();
    });
    it('reads the name and the budget of the wish, and nothing else, for anyone holding the address', async () => {
        findUnique.mockResolvedValue({ name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD' });
        const response = await http.get('/api/shared-wishes/' + wishShareToken(42));
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toEqual({ name: '橘色桌燈', maxPrice: 1500, priceCurrency: 'TWD' });
        expect(findUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { name: true, maxPrice: true, priceCurrency: true } });
        findUnique.mockResolvedValue({ name: '相機', maxPrice: null, priceCurrency: 'TWD' });
        expect(await readSharedWish(wishShareToken(43))).toEqual({ name: '相機', maxPrice: null, priceCurrency: null });
    });
    it('answers a deleted wish, a made-up address and an address with extras the same way, without reading for a forgery', async () => {
        findUnique.mockResolvedValue(null);
        const gone = await http.get('/api/shared-wishes/' + wishShareToken(42));
        expect(gone.status).toBe(404); expect(gone.body).toEqual({ errorCode: 'SHARED_WISH_UNAVAILABLE' });
        findUnique.mockClear();
        const forged = await http.get('/api/shared-wishes/' + 'A'.repeat(22));
        expect(forged.status).toBe(404); expect(forged.body).toEqual(gone.body);
        const extra = await http.get('/api/shared-wishes/' + wishShareToken(42) + '?id=1');
        expect(extra.status).toBe(404);
        expect(findUnique).not.toHaveBeenCalled();
    });
    it('reports a failed read as a failure, not as a missing wish, and says nothing about the database', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        findUnique.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
        const response = await http.get('/api/shared-wishes/' + wishShareToken(42));
        expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
        expect(JSON.stringify(error.mock.calls)).not.toContain('PRIVATE');
        error.mockRestore();
    });
});

describe('the first HTML of a shared page names what is shared', () => {
    it('describes a shared wish by its name and budget and keeps its address out of referrers', async () => {
        findUnique.mockResolvedValue({ name: '橘色 <桌燈>', maxPrice: 1500, priceCurrency: 'TWD' });
        const token = wishShareToken(42), response = await http.get('/shared-wishes/' + token);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.text).toContain('<meta property="og:title" content="願望：橘色 &lt;桌燈&gt;｜Wishlist.ai" />');
        expect(response.text).toContain('<meta property="og:description" content="有人許了這個願望，預算 TWD 1,500。如果你剛好看到，告訴對方吧！" />');
        expect(response.text).toContain(`<meta property="og:url" content="${site}/shared-wishes/${token}" />`);
        expect(response.text).toContain('<meta property="twitter:card" content="summary" />');
        expect(response.text).not.toContain('og:image');
        expect(response.text).toContain('<div id="root"></div>');
    });
    it('leaves a wish that is gone, or an address it did not make, to the ordinary page', async () => {
        findUnique.mockResolvedValue(null);
        expect((await http.get('/shared-wishes/' + wishShareToken(42))).text).toBe('ORDINARY_PAGE');
        findUnique.mockClear();
        expect((await http.get('/shared-wishes/' + 'A'.repeat(22))).text).toBe('ORDINARY_PAGE');
        expect(findUnique).not.toHaveBeenCalled();
    });
    it('describes a public-source product by its name, price and picture', async () => {
        product.mockResolvedValue({ kind: 'source', id: productId, key: 'source:' + productId, title: '二手 BenQ 螢幕', description: '九成新\n附原廠線', price: 2500, priceText: '2500', currency: 'TWD',
            thumbnailUrl: `/api/source-leads/${productId}/media/${productId}/thumbnail` });
        const response = await http.get('/products/source/' + productId.toUpperCase());
        expect(response.status).toBe(200);
        expect(product).toHaveBeenCalledWith('source:' + productId, expect.any(Date), true);
        expect(response.text).toContain('<meta property="og:title" content="二手 BenQ 螢幕｜NT$ 2,500｜Wishlist.ai" />');
        expect(response.text).toContain('<meta property="og:description" content="公開來源商品 · NT$ 2,500 · 庫存待確認 · 九成新 附原廠線" />');
        expect(response.text).toContain(`<meta property="og:url" content="${site}/products/source/${productId}" />`);
        expect(response.text).toContain(`<meta property="og:image" content="${site}/api/source-leads/${productId}/media/${productId}/thumbnail" />`);
        expect(response.text).toContain('<meta property="og:type" content="product" />');
        expect(response.text.match(/<meta property="og:image"/g)).toHaveLength(1);
    });
    it('writes an unstated price as the source wrote it, or as a price to ask for', async () => {
        product.mockResolvedValue({ kind: 'external', id: productId, title: '相機', description: '', price: null, priceText: '面議', currency: null, thumbnailUrl: null });
        expect((await http.get('/products/external/' + productId)).text).toContain('<meta property="og:title" content="相機｜面議｜Wishlist.ai" />');
        product.mockResolvedValue({ kind: 'external', id: productId, title: '相機', description: '', price: null, priceText: '', currency: null, thumbnailUrl: null });
        const response = await http.get('/products/external/' + productId);
        expect(response.text).toContain('<meta property="og:title" content="相機｜價格待詢問｜Wishlist.ai" />');
        expect(response.text).toContain('<meta property="twitter:card" content="summary" />');
    });
    it('sends a listing to its own page and leaves everything it cannot describe to the ordinary page', async () => {
        const listing = await http.get('/products/listing/' + productId);
        expect(listing.status).toBe(302); expect(listing.headers.location).toBe('/listings/' + productId);
        product.mockResolvedValue(null);
        expect((await http.get('/products/source/' + productId)).text).toBe('ORDINARY_PAGE');
        ready.mockResolvedValue(false); product.mockClear();
        expect((await http.get('/products/source/' + productId)).text).toBe('ORDINARY_PAGE');
        expect(product).not.toHaveBeenCalled();
        ready.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
        expect((await http.get('/products/source/' + productId)).text).toBe('ORDINARY_PAGE');
        expect((await http.get('/products/source/not-a-product')).text).toBe('ORDINARY_PAGE');
        expect((await http.get('/products/other/' + productId)).text).toBe('ORDINARY_PAGE');
    });
});
