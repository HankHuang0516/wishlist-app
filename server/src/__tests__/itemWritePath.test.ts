/**
 * Write-path security regression tests (security-review HIGH #1 + LOW).
 *
 * These are NOT isolation tests of the bridge helper — they drive the ACTUAL
 * createItem controller (the real merchant write path) and the ACTUAL route
 * table, so they catch the exact gap the review flagged: a security helper that
 * exists but is never reached by the control path.
 *
 * Prisma and the network are mocked; eclawBridge.verifyPublicCode is stubbed so
 * we control resolve/spoof/outage without hitting EClaw.
 */

// --- Mock Prisma (default-export instance) ---
const mockItemCreate = jest.fn();
const mockWishlistFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({
    __esModule: true,
    default: {
        item: { create: (...a: any[]) => mockItemCreate(...a) },
        wishlist: { findUnique: (...a: any[]) => mockWishlistFindUnique(...a) },
    },
}));

// --- Spy on the bridge but keep the real parse logic ---
import * as bridge from '../lib/eclawBridge';
const verifySpy = jest.spyOn(bridge, 'verifyPublicCode');

import { createItem } from '../controllers/itemController';

function mockRes() {
    const res: any = {};
    res.statusCode = 200;
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.json = jest.fn((b: any) => { res.body = b; return res; });
    return res;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWishlistFindUnique.mockResolvedValue({ id: 1, userId: 99, isPublic: true });
    mockItemCreate.mockResolvedValue({ id: 123, name: 'ok' });
});

describe('createItem — proxy_end_user_id is verified, not trusted (HIGH #1)', () => {
    it('REJECTS (403) a spoofed eclaw: code and never writes to the DB', async () => {
        // EClaw says the code does not resolve → spoof.
        verifySpy.mockResolvedValue({ ok: false, reason: 'not_found' });
        const req: any = {
            merchant: { id: 7 },
            params: { wishlistId: '1' },
            body: { name: 'Cheap iPhone', proxy_end_user_id: 'eclaw:zzzzzz' },
        };
        const res = mockRes();
        await createItem(req, res);

        expect(res.statusCode).toBe(403);
        // The security-critical assertion: the write NEVER happened.
        expect(mockItemCreate).not.toHaveBeenCalled();
        expect(verifySpy).toHaveBeenCalledWith('zzzzzz');
    });

    it('FAILS CLOSED (503) when EClaw verification is unavailable — no write', async () => {
        verifySpy.mockResolvedValue({ ok: false, reason: 'upstream_error' });
        const req: any = {
            merchant: { id: 7 },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'eclaw:tbwb9e' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(503);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('ALLOWS a verified eclaw: code and persists the CANONICAL code', async () => {
        verifySpy.mockResolvedValue({
            ok: true,
            entity: { publicCode: 'tbwb9e', name: 'A', character: 'b' },
        });
        const req: any = {
            merchant: { id: 7 },
            params: { wishlistId: '1' },
            body: { name: 'Genuine listing', proxy_end_user_id: 'ECLAW:TBWB9E' },
        };
        const res = mockRes();
        await createItem(req, res);

        expect(res.statusCode).toBe(201);
        expect(mockItemCreate).toHaveBeenCalledTimes(1);
        const written = mockItemCreate.mock.calls[0][0].data.proxy_end_user_id;
        expect(written).toBe('eclaw:tbwb9e'); // canonicalized, not the raw input
    });

    it('REJECTS (400) a malformed eclaw: code without calling EClaw or the DB', async () => {
        const req: any = {
            merchant: { id: 7 },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'eclaw:BAD' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(400);
        expect(verifySpy).not.toHaveBeenCalled();
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('stores an opaque NON-eclaw proxy id as-is (never verified, never trusted for identity)', async () => {
        const req: any = {
            merchant: { id: 7 },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'shopify-cust-42' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(201);
        expect(verifySpy).not.toHaveBeenCalled();
        expect(mockItemCreate.mock.calls[0][0].data.proxy_end_user_id).toBe('shopify-cust-42');
    });
});

describe('itemRoutes — route ordering guard (LOW)', () => {
    it('registers /search and /by-eclaw BEFORE the numeric /:id route', () => {
        // Reorder trap: if someone moves /search after /:id, /search would be
        // swallowed by /:id (authed) — this test fails first.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const router = require('../routes/itemRoutes').default;
        const paths: string[] = router.stack
            .filter((l: any) => l.route)
            .map((l: any) => l.route.path);

        const idxSearch = paths.indexOf('/search');
        const idxByEclaw = paths.indexOf('/by-eclaw/:code');
        const idxId = paths.indexOf('/:id');

        expect(idxSearch).toBeGreaterThanOrEqual(0);
        expect(idxByEclaw).toBeGreaterThanOrEqual(0);
        expect(idxId).toBeGreaterThanOrEqual(0);
        expect(idxSearch).toBeLessThan(idxId);
        expect(idxByEclaw).toBeLessThan(idxId);
    });
});
