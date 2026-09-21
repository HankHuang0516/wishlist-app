import { randomBytes, randomUUID } from 'node:crypto';
const { startAndroidQaInput } = require('../../../mobile/scripts/android-qa-input.cjs');

const packageName = 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.qa202609212330';
const actors = () => ({ buyer: { email: randomUUID() + '-buyer@example.invalid', password: 'Qa' + randomBytes(16).toString('hex') + '123' } });

describe('private isolated Android input broker', () => {
    let broker: any;
    afterEach(async () => { if (broker) await broker.stop(); broker = undefined; });
    const get = (pathname: string, options: RequestInit = {}) => fetch('http://127.0.0.1:' + broker.port + pathname,
        { ...options, headers: { 'x-wishlist-qa-package': packageName, ...(options.headers || {}) }, signal: AbortSignal.timeout(3000) });

    it('returns the two credential actions once and in the required order', async () => {
        const seed = actors(); broker = await startAndroidQaInput(packageName, seed, 1000);
        const login = await get('/credentials/login-buyer');
        expect(login.status).toBe(200); expect(login.headers.get('cache-control')).toBe('no-store');
        const first: any = await login.json();
        expect(first.action).toBe('login-buyer');
        expect(first.fields.map((field: any) => field.label)).toEqual(['手機號碼或 Email', '密碼']);
        expect(first.fields.map((field: any) => field.value)).toEqual([seed.buyer.email, seed.buyer.password]);
        expect((await get('/credentials/login-buyer')).status).toBe(409);
        const deletion: any = await (await get('/credentials/deletion-buyer')).json();
        expect(deletion).toEqual({ action: 'deletion-buyer', fields: [{ label: '刪除帳號的目前密碼', value: seed.buyer.password }] });
        expect(broker.completed).toEqual(['login-buyer', 'deletion-buyer']);
    });

    it.each(['package', 'origin', 'method', 'body', 'unknown', 'out-of-order'])('rejects unsafe request %s without consuming an action', async reason => {
        broker = await startAndroidQaInput(packageName, actors(), 1000);
        const response = await get(reason === 'unknown' ? '/credentials/seller' : reason === 'out-of-order' ? '/credentials/deletion-buyer' : '/credentials/login-buyer',
            reason === 'package' ? { headers: { 'x-wishlist-qa-package': packageName.replace(/\.qa.*/, '') } } :
                reason === 'origin' ? { headers: { Origin: 'https://example.invalid' } } : reason === 'method' ? { method: 'POST' } :
                    reason === 'body' ? { method: 'POST', body: 'x' } : {});
        expect(response.status >= 400).toBe(true); expect(broker.completed).toEqual([]);
    });

    it('records only bounded rejection enums, never supplied values', async () => {
        broker = await startAndroidQaInput(packageName, actors(), 1000);
        expect((await get('/credentials/login-buyer', { headers: { Origin: 'https://secret.invalid' } })).status).toBe(403);
        expect(broker.rejections).toEqual(['origin']); expect(JSON.stringify(broker.rejections)).not.toContain('secret');
    });

    it.each(['package', 'email', 'password', 'lifetime'])('rejects unsafe seed %s before listening', async field => {
        const seed = actors();
        if (field === 'email') seed.buyer.email = 'real@example.com';
        if (field === 'password') seed.buyer.password = 'not-a-fixture';
        await expect(startAndroidQaInput(field === 'package' ? packageName.replace(/\.qa.*/, '') : packageName, seed,
            field === 'lifetime' ? 360001 : 1000)).rejects.toThrow();
    });
});
