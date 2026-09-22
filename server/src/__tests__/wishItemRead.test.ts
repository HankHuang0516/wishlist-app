import { getItem, getPublicItems, publicWishItemSelect } from '../controllers/wishItemReadController';
import prisma from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import type { Response, Request } from 'express';
jest.mock('../lib/prisma', () => ({ __esModule: true, default: { item: { findFirst: jest.fn(), findMany: jest.fn() }, $transaction: jest.fn() } }));
const first = prisma.item.findFirst as jest.Mock;
const many = prisma.item.findMany as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
beforeEach(() => transaction.mockImplementation(callback => callback(prisma)));
// Minimal controller fixture, not a real Express IncomingMessage.
const request = (id = '7', user = true) => ({ params: { id }, ...(user ? { user: { id: 11 } } : {}) } as unknown as AuthRequest);
function response() {
    const r = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
    r.status.mockReturnValue(r); r.json.mockReturnValue(r);
    return r as unknown as Response & typeof r;
}
afterEach(() => jest.restoreAllMocks());
describe('wish item reads / authorization in the actual SELECT', () => {
    it('bounds the public feed and filters visibility before selecting display fields', async () => {
        many.mockResolvedValueOnce([{ id: 7 }]); const res = response();
        await getPublicItems({} as Request, res);
        expect(many).toHaveBeenCalledWith({ where: { isHidden: false, wishlist: { isPublic: true } }, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: publicWishItemSelect });
        expect(res.json).toHaveBeenCalledWith([{ id: 7 }]); expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    });
    it('does not expose failure details from the public feed', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {}); many.mockRejectedValueOnce(new Error('synthetic-private-detail'));
        const res = response(); await getPublicItems({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(res.json.mock.calls)).not.toContain('synthetic-private-detail');
    });
    it('requires an actual authenticated user even when called without the route middleware', async () => {
        const res = response(); await getItem(request('7', false), res);
        expect(res.status).toHaveBeenCalledWith(401); expect(first).not.toHaveBeenCalled();
    });
    it.each(['0', '-1', '1.5', '2147483648', 'not-an-id'])('rejects invalid item ID %s without querying data', async id => {
        const res = response(); await getItem(request(id), res); expect(res.status).toHaveBeenCalledWith(400); expect(first).not.toHaveBeenCalled();
    });
    it('retains the complete own item while anchoring ownership in the SELECT', async () => {
        const owned = { id: 7, isHidden: true, proxy_end_user_id: 'synthetic-own-only' }; first.mockResolvedValueOnce(owned);
        const res = response(); await getItem(request(), res);
        expect(first.mock.calls[0][0].where).toEqual({ id: 7, wishlist: { userId: 11 } }); expect(first).toHaveBeenCalledTimes(1); expect(res.json).toHaveBeenCalledWith(owned);
    });
    it('never follows an owner miss with an unguarded public read', async () => {
        first.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 7 });
        const res = response(); await getItem(request(), res);
        expect(first.mock.calls[1][0]).toEqual({ where: { id: 7, isHidden: false, wishlist: { isPublic: true } }, select: publicWishItemSelect }); expect(res.json).toHaveBeenCalledWith({ id: 7 });
    });
    it('uses the same non-enumerating response for missing, private and hidden items', async () => {
        first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        const res = response(); await getItem(request(), res); expect(res.status).toHaveBeenCalledWith(404); expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    });
    it('does not expose database failure details in item reads', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {}); first.mockRejectedValueOnce(new Error('synthetic-private-detail'));
        const res = response(); await getItem(request(), res);
        expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(res.json.mock.calls)).not.toContain('synthetic-private-detail');
    });
});
