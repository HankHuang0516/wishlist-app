/**
 * Write-path security regression tests (card_e30cf03d — NO merchant key).
 *
 * These drive the ACTUAL createItem / upsertEclawListing controllers AND the
 * ACTUAL route table, so they catch the exact gap a review would flag: an auth
 * helper that exists but is never reached by the control path.
 *
 * Prisma is mocked. The EClaw verify CALLBACK (lib/eclawVerify) is stubbed so we
 * control verified/spoof/outage without hitting EClaw. The controller-direct
 * tests set req.eclawAgent (as the middleware would) to assert the binding; the
 * route tests exercise authenticateEclawAgent → controller end-to-end.
 */

// --- Mock Prisma (default-export instance) ---
const mockItemCreate = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemFindUnique = jest.fn();
const mockWishlistFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({
    __esModule: true,
    default: {
        item: {
            create: (...a: any[]) => mockItemCreate(...a),
            update: (...a: any[]) => mockItemUpdate(...a),
            findUnique: (...a: any[]) => mockItemFindUnique(...a),
        },
        wishlist: { findUnique: (...a: any[]) => mockWishlistFindUnique(...a) },
    },
}));

// --- Spy on the EClaw verify callback + the P1 network verifier ---
import * as verifyLib from '../lib/eclawVerify';
const verifyAgentSpy = jest.spyOn(verifyLib, 'verifyEclawAgent');

import * as bridge from '../lib/eclawBridge';
const verifyPublicCodeSpy = jest.spyOn(bridge, 'verifyPublicCode');

import { createItem, upsertEclawListing } from '../controllers/itemController';

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

describe('createItem — bound to the VERIFIED EClaw agent (NO merchant key)', () => {
    it('ALLOWS a verified agent and persists the CANONICAL eclaw:<code>', async () => {
        const req: any = {
            eclawAgent: { publicCode: 'tbwb9e' }, // set by authenticateEclawAgent
            params: { wishlistId: '1' },
            body: { name: 'Genuine listing' },
        };
        const res = mockRes();
        await createItem(req, res);

        expect(res.statusCode).toBe(201);
        expect(mockItemCreate).toHaveBeenCalledTimes(1);
        const written = mockItemCreate.mock.calls[0][0].data.proxy_end_user_id;
        expect(written).toBe('eclaw:tbwb9e'); // bound to the verified agent code
    });

    it('REJECTS (403) an agent trying to write under a DIFFERENT eclaw code', async () => {
        const req: any = {
            eclawAgent: { publicCode: 'tbwb9e' },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'eclaw:zzzzzz' }, // not the caller's
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(403);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('binds to the agent code even if the body claims the SAME code differently-cased', async () => {
        const req: any = {
            eclawAgent: { publicCode: 'tbwb9e' },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'ECLAW:TBWB9E' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(201);
        expect(mockItemCreate.mock.calls[0][0].data.proxy_end_user_id).toBe('eclaw:tbwb9e');
    });

    it('401 when neither a user nor a verified agent is present', async () => {
        const req: any = { params: { wishlistId: '1' }, body: { name: 'x' } };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(401);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });
});

describe('createItem — a logged-in USER path still verifies an eclaw: proxy id (P1)', () => {
    it('REJECTS (403) a spoofed eclaw: code from a user and never writes', async () => {
        verifyPublicCodeSpy.mockResolvedValue({ ok: false, reason: 'not_found' } as any);
        const req: any = {
            user: { id: 99 },
            params: { wishlistId: '1' },
            body: { name: 'Cheap iPhone', proxy_end_user_id: 'eclaw:zzzzzz' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(403);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('FAILS CLOSED (503) when EClaw verification is unavailable — no write', async () => {
        verifyPublicCodeSpy.mockResolvedValue({ ok: false, reason: 'upstream_error' } as any);
        const req: any = {
            user: { id: 99 },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'eclaw:tbwb9e' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(503);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('stores an opaque NON-eclaw proxy id as-is (user path, never trusted for identity)', async () => {
        const req: any = {
            user: { id: 99 },
            params: { wishlistId: '1' },
            body: { name: 'x', proxy_end_user_id: 'shopify-cust-42' },
        };
        const res = mockRes();
        await createItem(req, res);
        expect(res.statusCode).toBe(201);
        expect(verifyPublicCodeSpy).not.toHaveBeenCalled();
        expect(mockItemCreate.mock.calls[0][0].data.proxy_end_user_id).toBe('shopify-cust-42');
    });
});

describe('upsertEclawListing — bound to the verified agent code', () => {
    it('CREATE: writes the listing under the agent code (no merchant, no re-verify)', async () => {
        mockItemCreate.mockResolvedValue({ id: 9, name: 'thing' });
        const req: any = {
            eclawAgent: { publicCode: 'tbwb9e' },
            body: { wishlistId: 1, name: 'thing', price: 42 },
        };
        const res = mockRes();
        await upsertEclawListing(req, res);
        expect(res.statusCode).toBe(201);
        expect(mockItemCreate.mock.calls[0][0].data.proxy_end_user_id).toBe('eclaw:tbwb9e');
        expect(res.body.seller).toBe('tbwb9e');
        // The upsert path must not call the network verifier at all now.
        expect(verifyPublicCodeSpy).not.toHaveBeenCalled();
    });

    it('REJECTS (403) writing under a code the agent does not control', async () => {
        const req: any = {
            eclawAgent: { publicCode: 'tbwb9e' },
            body: { wishlistId: 1, name: 'thing', publicCode: '3xa3h4' },
        };
        const res = mockRes();
        await upsertEclawListing(req, res);
        expect(res.statusCode).toBe(403);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('401 when no verified agent is present', async () => {
        const req: any = { body: { wishlistId: 1, name: 'thing' } };
        const res = mockRes();
        await upsertEclawListing(req, res);
        expect(res.statusCode).toBe(401);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });
});

describe('upsert-listing ROUTE — authenticateEclawAgent gates the write end-to-end', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('express');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const request = require('supertest');

    function appWith() {
        const app = express();
        app.use(express.json());
        app.use('/api/items', require('../routes/itemRoutes').default);
        return app;
    }

    it('verified agent → 201, and the bot secret is NEVER persisted or logged', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        verifyAgentSpy.mockResolvedValue({ ok: true, publicCode: 'tbwb9e' });
        mockItemCreate.mockResolvedValue({ id: 9, name: 'thing' });

        const SECRET = 'super-secret-bot-value';
        const res = await request(appWith())
            .post('/api/items/upsert-listing')
            .set('x-eclaw-device-id', 'dev-1')
            .set('x-eclaw-entity-id', '2')
            .set('x-eclaw-bot-secret', SECRET)
            .send({ wishlistId: 1, name: 'thing', price: 42 });

        expect(res.status).toBe(201);
        // (1) The stored row carries the eclaw:<code>, NOT the secret.
        const writtenData = mockItemCreate.mock.calls[0][0].data;
        expect(writtenData.proxy_end_user_id).toBe('eclaw:tbwb9e');
        expect(JSON.stringify(writtenData)).not.toContain(SECRET);
        // (2) The secret never appears in ANY log call.
        const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errSpy.mock.calls]
            .flat()
            .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
            .join(' ');
        expect(allLogs).not.toContain(SECRET);

        logSpy.mockRestore(); warnSpy.mockRestore(); errSpy.mockRestore();
    });

    it('spoofed / unverified identity → 403, no write', async () => {
        verifyAgentSpy.mockResolvedValue({ ok: false, reason: 'invalid' });
        const res = await request(appWith())
            .post('/api/items/upsert-listing')
            .set('x-eclaw-agent-token', 'v1.forged.sig')
            .send({ wishlistId: 1, name: 'thing' });
        expect(res.status).toBe(403);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('EClaw verify DOWN → 503 fail-closed, no write', async () => {
        verifyAgentSpy.mockResolvedValue({ ok: false, reason: 'upstream_error' });
        const res = await request(appWith())
            .post('/api/items/upsert-listing')
            .set('x-eclaw-agent-token', 'v1.whatever.sig')
            .send({ wishlistId: 1, name: 'thing' });
        expect(res.status).toBe(503);
        expect(mockItemCreate).not.toHaveBeenCalled();
    });

    it('no EClaw credentials at all → 401, no verify call, no write', async () => {
        const res = await request(appWith())
            .post('/api/items/upsert-listing')
            .send({ wishlistId: 1, name: 'thing' });
        expect(res.status).toBe(401);
        expect(verifyAgentSpy).not.toHaveBeenCalled();
        expect(mockItemCreate).not.toHaveBeenCalled();
    });
});

describe('itemRoutes — route ordering guard (LOW)', () => {
    it('registers /search and /by-eclaw BEFORE the numeric /:id route', () => {
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
