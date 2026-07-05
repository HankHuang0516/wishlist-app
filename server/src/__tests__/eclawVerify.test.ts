/**
 * eclawVerify — the NO-merchant-key write-path identity check (card_e30cf03d).
 *
 * The wishlist backend proves an EClaw agent by calling BACK to EClaw's
 * `/api/agent-identity/verify`. These tests inject a fake fetch so they run with
 * NO network and assert the exact trust boundary:
 *   - a token OR a botSecret triple is forwarded, named UA `curl/8.4.0`;
 *   - trust is granted ONLY on a live 200 { valid:true, publicCode };
 *   - invalid / malformed-code / non-200 (outage) / network-throw / no-creds are
 *     all rejected — an outage is FAIL-CLOSED (reason:'upstream_error');
 *   - the credentials are sent once and never surfaced in the result.
 */

import {
    extractAgentCredentials,
    verifyEclawAgent,
    AGENT_TOKEN_HEADER,
    AGENT_DEVICE_ID_HEADER,
    AGENT_ENTITY_ID_HEADER,
    AGENT_BOT_SECRET_HEADER,
} from '../lib/eclawVerify';

type FakeResp = { ok: boolean; status: number; json: () => Promise<any> };
const mkResp = (status: number, body: any): FakeResp => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

describe('extractAgentCredentials', () => {
    it('prefers the token header', () => {
        const c = extractAgentCredentials({ [AGENT_TOKEN_HEADER]: 'v1.a.b' });
        expect(c).toEqual({ token: 'v1.a.b' });
    });
    it('falls back to the device/entity/bot-secret triple', () => {
        const c = extractAgentCredentials({
            [AGENT_DEVICE_ID_HEADER]: 'dev-1',
            [AGENT_ENTITY_ID_HEADER]: '2',
            [AGENT_BOT_SECRET_HEADER]: 'sekret',
        });
        expect(c).toEqual({ deviceId: 'dev-1', entityId: '2', botSecret: 'sekret' });
    });
    it('returns null when no usable proof is present', () => {
        expect(extractAgentCredentials({})).toBeNull();
        expect(extractAgentCredentials({ [AGENT_DEVICE_ID_HEADER]: 'dev-1' })).toBeNull(); // incomplete triple
    });
});

describe('verifyEclawAgent', () => {
    it('token path: valid → { ok:true, publicCode } and forwards the token + named UA', async () => {
        const calls: any[] = [];
        const fetchImpl = async (url: string, init: any) => {
            calls.push({ url, init });
            return mkResp(200, { valid: true, publicCode: 'tbwb9e' });
        };
        const res = await verifyEclawAgent({ token: 'v1.a.b' }, fetchImpl as any);
        expect(res).toEqual({ ok: true, publicCode: 'tbwb9e' });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://eclawbot.com/api/agent-identity/verify');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.headers['User-Agent']).toBe('curl/8.4.0');
        expect(JSON.parse(calls[0].init.body)).toEqual({ token: 'v1.a.b' });
    });

    it('botSecret path: forwards the triple (no token) and returns the code', async () => {
        const calls: any[] = [];
        const fetchImpl = async (url: string, init: any) => {
            calls.push({ url, init });
            return mkResp(200, { valid: true, publicCode: 'tbwb9e' });
        };
        const res = await verifyEclawAgent(
            { deviceId: 'dev-1', entityId: '2', botSecret: 'sekret' },
            fetchImpl as any
        );
        expect(res.ok).toBe(true);
        expect(JSON.parse(calls[0].init.body)).toEqual({ deviceId: 'dev-1', entityId: '2', botSecret: 'sekret' });
    });

    it('lowercases + validates the returned publicCode', async () => {
        const fetchImpl = async () => mkResp(200, { valid: true, publicCode: 'TBWB9E' });
        const res = await verifyEclawAgent({ token: 't' }, fetchImpl as any);
        expect(res).toEqual({ ok: true, publicCode: 'tbwb9e' });
    });

    it('rejects a spoofed/invalid identity (valid:false) → { ok:false, invalid }', async () => {
        const fetchImpl = async () => mkResp(200, { valid: false, reason: 'not_verified' });
        const res = await verifyEclawAgent({ token: 'v1.forged.sig' }, fetchImpl as any);
        expect(res).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects a 200 with a malformed publicCode', async () => {
        const fetchImpl = async () => mkResp(200, { valid: true, publicCode: 'NOT-6' });
        const res = await verifyEclawAgent({ token: 't' }, fetchImpl as any);
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('invalid');
    });

    it('FAILS CLOSED on a non-200 (EClaw outage) → upstream_error', async () => {
        const fetchImpl = async () => mkResp(503, { error: 'down' });
        const res = await verifyEclawAgent({ token: 't' }, fetchImpl as any);
        expect(res).toEqual({ ok: false, reason: 'upstream_error' });
    });

    it('FAILS CLOSED on a network throw → upstream_error', async () => {
        const fetchImpl = async () => { throw new Error('ECONNRESET'); };
        const res = await verifyEclawAgent({ token: 't' }, fetchImpl as any);
        expect(res).toEqual({ ok: false, reason: 'upstream_error' });
    });

    it('rejects when no credentials are supplied (never calls the network)', async () => {
        let called = false;
        const fetchImpl = async () => { called = true; return mkResp(200, { valid: true, publicCode: 'tbwb9e' }); };
        const res = await verifyEclawAgent(null, fetchImpl as any);
        expect(res).toEqual({ ok: false, reason: 'no_credentials' });
        expect(called).toBe(false);
    });
});
