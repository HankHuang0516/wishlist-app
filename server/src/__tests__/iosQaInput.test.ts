import { randomBytes, randomUUID } from 'node:crypto';
const { startIosQaInput } = require('../../../mobile/scripts/ios-qa-input.cjs');
const label = '202609152210', bundle = 'com.hankhuang.weesh.qa' + label;
// These unit-only random strings never authenticate a real account/DB.
const actors = () => ({ buyer: { email: randomUUID() + '-buyer@example.invalid', password: 'Qa' + randomBytes(16).toString('hex') + '123' } });
describe('private isolated iOS input broker', () => {
    let broker: any;
    afterEach(async () => { if (broker) await broker.stop(); broker = undefined; });
    const get = (pathname: string, options: RequestInit = {}) => fetch('http://127.0.0.1:' + broker.port + pathname,
        { ...options, headers: { 'x-wishlist-qa-bundle': bundle, ...(options.headers || {}) }, signal: AbortSignal.timeout(3000) });
    it('transfers a one-use credential payload only to the App and returns no values to the test requester', async () => {
        const seed = actors(); let valuesMatch = false, secondReadRejected = false;
        broker = await startIosQaInput(label, seed, async (url: string) => {
            const parsed = new URL(url), job = parsed.searchParams.get('job');
            expect(parsed.protocol === 'wishlistqa' + label + ':').toBe(true);
            const response = await get('/credentials/' + job);
            expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
            const payload: any = await response.json();
            valuesMatch = payload.fields[0].value === seed.buyer.email && payload.fields[1].value === seed.buyer.password;
            secondReadRejected = (await get('/credentials/' + job)).status === 409;
            await get('/done/' + job);
        });
        const response = await get('/request/login-buyer');
        expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
        expect(valuesMatch).toBe(true); expect(secondReadRejected).toBe(true); expect(broker.completed).toEqual(['login-buyer']);
        expect((await get('/request/login-buyer')).status).toBe(409);
    });
    it.each(['foreign-bundle', 'origin', 'post', 'unknown', 'out-of-order'])('rejects unsafe request %s without invoking device work', async reason => {
        let calls = 0;
        broker = await startIosQaInput(label, actors(), async () => { calls++; });
        const response = await get(reason === 'unknown' ? '/credentials/unknown' : reason === 'out-of-order' ? '/request/deletion-buyer' : '/request/login-buyer',
            reason === 'foreign-bundle' ? { headers: { 'x-wishlist-qa-bundle': 'com.hankhuang.weesh' } } :
                reason === 'origin' ? { headers: { Origin: 'https://example.invalid' } } : reason === 'post' ? { method: 'POST' } : {});
        expect(response.status >= 400).toBe(true); expect(calls).toBe(0);
    });
    it('cannot acknowledge input before the one-use App read', async () => {
        let rejected = false;
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            const job = new URL(url).searchParams.get('job');
            rejected = (await get('/done/' + job)).status === 409;
            await get('/credentials/' + job); await get('/failed/' + job);
        });
        expect((await get('/request/login-buyer')).status).toBe(409); expect(rejected).toBe(true); expect(broker.completed).toEqual([]);
    });
    it('releases pending input immediately on stop, without reporting success', async () => {
        let opened!: () => void; const started = new Promise<void>(resolve => { opened = resolve; });
        broker = await startIosQaInput(label, actors(), async () => { opened(); });
        const result = get('/request/login-buyer'); await started;
        await broker.stop(); expect((await result).status).toBe(409); expect(broker.completed).toEqual([]);
    });
    it('allows only the password field in the later deletion action', async () => {
        let secondSafe = false;
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            const job = new URL(url).searchParams.get('job'), payload: any = await (await get('/credentials/' + job)).json();
            if (payload.action === 'deletion-buyer') secondSafe = payload.fields.length === 1 && payload.fields[0].label === '刪除帳號的目前密碼';
            await get('/done/' + job);
        });
        await get('/request/login-buyer'); expect((await get('/request/deletion-buyer')).status).toBe(200);
        expect(secondSafe).toBe(true); expect(broker.completed).toEqual(['login-buyer', 'deletion-buyer']);
    });
    it('records only public stage enums and never grants credentials to the status request', async () => {
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            const job = new URL(url).searchParams.get('job');
            expect(await (await get('/status/' + job + '/app-entered')).json()).toEqual({ ok: true });
            expect((await get('/status/' + job + '/unknown')).status).toBe(400);
            await get('/credentials/' + job); await get('/status/' + job + '/input-applied'); await get('/done/' + job);
        });
        expect((await get('/request/login-buyer')).status).toBe(200);
        expect(broker.stages).toEqual(['login-buyer:requested', 'login-buyer:app-entered', 'login-buyer:credentials-taken', 'login-buyer:input-applied', 'login-buyer:url-opened']);
    });
    it.each(['app-not-active', 'credentials-unavailable', 'values-rejected', 'fields-rejected'])('terminates failed input at safe stage %s without a credential read', async stage => {
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            await get('/status/' + new URL(url).searchParams.get('job') + '/' + stage);
        });
        expect((await get('/request/login-buyer')).status).toBe(409); expect(broker.completed).toEqual([]);
        expect(broker.stages).toContain('login-buyer:' + stage);
        expect(broker.stages).not.toContain('login-buyer:credentials-taken');
    });
    it.each(['/status/unknown/app-active', '/status/unknown', '/request/login-buyer/app-active'])('rejects unknown capabilities or extra segments %s', async pathname => {
        let opened = false;
        broker = await startIosQaInput(label, actors(), async () => { opened = true; });
        expect((await get(pathname)).status >= 400).toBe(true); expect(opened).toBe(false); expect(broker.completed).toEqual([]);
    });
    it('accepts only public probes without opening device work or granting actor fields', async () => {
        let opened = false;
        broker = await startIosQaInput(label, actors(), async () => { opened = true; });
        for (const stage of ['app-started', 'url-delivered', 'url-guard-rejected', 'action-guard-rejected']) {
            expect(await (await get('/probe/' + stage)).json()).toEqual({ ok: true });
        }
        expect(broker.probes).toEqual(['app-started', 'url-delivered', 'url-guard-rejected', 'action-guard-rejected']);
        expect(broker.completed).toEqual([]); expect(broker.stages).toEqual([]); expect(opened).toBe(false);
    });
    it.each(['/probe/unknown', '/probe/app-started/app-active'])('rejects unsupported probe %s without recording request data', async pathname => {
        broker = await startIosQaInput(label, actors(), async () => undefined);
        expect((await get(pathname)).status).toBe(400); expect(broker.probes).toEqual([]); expect(broker.completed).toEqual([]);
    });
    it.each(['bundle', 'origin'])('reports only rejection name %s without supplied header values', async reason => {
        broker = await startIosQaInput(label, actors(), async () => undefined);
        const options: RequestInit = reason === 'bundle' ? { headers: { 'x-wishlist-qa-bundle': 'com.hankhuang.weesh' } } : { headers: { Origin: 'https://example.invalid' } };
        expect((await get('/probe/app-started', options)).status).toBe(403);
        expect(broker.rejections).toEqual([reason]); expect(broker.probes).toEqual([]);
    });
    it('bounds probe diagnostics and rejects further probes without granting actor data', async () => {
        broker = await startIosQaInput(label, actors(), async () => undefined);
        for (let index = 0; index < 32; index++) expect((await get('/probe/app-started')).status).toBe(200);
        expect((await get('/probe/app-started')).status).toBe(400); expect(broker.probes.length).toBe(32); expect(broker.completed).toEqual([]);
    });
    it('claims notification input only once in the App client and returns no actor values to XCTest', async () => {
        let payloadSafe = false, claimOnce = false;
        broker = await startIosQaInput(label, actors(), async () => {
            const response = await get('/pending/login-buyer'), payload: any = await response.json();
            payloadSafe = response.status === 200 && Object.keys(payload).sort().join(',') === 'action,job' && payload.action === 'login-buyer';
            claimOnce = (await get('/pending/login-buyer')).status === 404;
            await get('/credentials/' + payload.job); await get('/done/' + payload.job);
        }, 1000, 'notification');
        const response = await get('/request/login-buyer');
        expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true }); expect(payloadSafe && claimOnce).toBe(true);
        expect(broker.stages).toEqual(['login-buyer:requested', 'login-buyer:capability-claimed', 'login-buyer:credentials-taken', 'login-buyer:notification-posted']);
    });
    it('does not expose a claim endpoint in URL mode', async () => {
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            expect((await get('/pending/login-buyer')).status).toBe(404);
            const job = new URL(url).searchParams.get('job'); await get('/credentials/' + job); await get('/done/' + job);
        });
        expect((await get('/request/login-buyer')).status).toBe(200);
    });
    it.each(['seller', 'deletion-buyer'])('does not claim unrelated notification action %s', async action => {
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            expect((await get('/pending/' + action)).status).toBe(404);
            const job = new URL(url).searchParams.get('job'); await get('/credentials/' + job); await get('/failed/' + job);
        }, 1000, 'notification');
        expect((await get('/request/login-buyer')).status).toBe(409); expect(broker.completed).toEqual([]);
    });
    it('cannot claim a finished or expired job', async () => {
        broker = await startIosQaInput(label, actors(), async (url: string) => {
            const job = new URL(url).searchParams.get('job'); await get('/credentials/' + job); await get('/failed/' + job);
        }, 1000, 'notification');
        await get('/request/login-buyer'); expect((await get('/pending/login-buyer')).status).toBe(404);
    });
    it('rejects an unknown notification trigger before listening', async () => {
        await expect(startIosQaInput(label, actors(), async () => undefined, 1000, 'unknown')).rejects.toThrow();
    });
    it.each(['email', 'password', 'lifetime', 'callback'])('rejects unsafe broker seed %s before opening a listener', async field => {
        const seed = actors();
        if (field === 'email') seed.buyer.email = 'real@example.com';
        if (field === 'password') seed.buyer.password = 'not-a-fixture';
        await expect(startIosQaInput(label, seed, field === 'callback' ? null : async () => undefined, field === 'lifetime' ? 360001 : 1000)).rejects.toThrow();
    });
});
