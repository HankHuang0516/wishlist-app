/**
 * eclawBridge — public-code verification (anti-spoofing) unit tests.
 *
 * The bridge is the security boundary for EClaw identity: an untrusted
 * `proxy_end_user_id` of the form `eclaw:<code>` is trusted ONLY after the
 * code resolves against EClaw's live public-code index. These tests inject a
 * fake fetch so they run with NO network and assert the exact trust boundary:
 * spoofed / unknown / malformed / upstream-down codes are all rejected, and
 * only a real EClaw 200 grants trust — surfacing public fields only, never PII.
 */

import {
    parseEclawPublicCode,
    verifyPublicCode,
    resolveProxyIdentity,
} from '../lib/eclawBridge';

type FakeResp = { ok: boolean; status: number; json: () => Promise<any> };
const mkResp = (status: number, body: any): FakeResp => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

describe('parseEclawPublicCode', () => {
    it('extracts a valid 6-char code from the eclaw: envelope', () => {
        expect(parseEclawPublicCode('eclaw:tbwb9e')).toBe('tbwb9e');
    });
    it('lowercases + trims', () => {
        expect(parseEclawPublicCode('eclaw: TBWB9E ')).toBe('tbwb9e');
    });
    it('rejects non-eclaw strings', () => {
        expect(parseEclawPublicCode('user-42')).toBeNull();
        expect(parseEclawPublicCode('tbwb9e')).toBeNull(); // no prefix
    });
    it('rejects malformed / wrong-length codes', () => {
        expect(parseEclawPublicCode('eclaw:abc')).toBeNull(); // too short
        expect(parseEclawPublicCode('eclaw:toolongcode')).toBeNull();
        expect(parseEclawPublicCode('eclaw:has_sym')).toBeNull();
    });
    it('rejects non-string input (untrusted-shape guard)', () => {
        expect(parseEclawPublicCode(undefined)).toBeNull();
        expect(parseEclawPublicCode(42 as any)).toBeNull();
        expect(parseEclawPublicCode({ code: 'tbwb9e' } as any)).toBeNull();
    });
});

describe('verifyPublicCode', () => {
    it('grants trust on EClaw 200 and surfaces ONLY public fields', async () => {
        const fetchImpl = jest.fn(async () =>
            mkResp(200, {
                success: true,
                entity: {
                    publicCode: 'tbwb9e',
                    name: 'Lobster',
                    character: 'crab',
                    // Fields we must NOT surface even if EClaw returned them:
                    avatar: 'secret-avatar',
                    identity: { role: 'internal' },
                },
            })
        );
        const r = await verifyPublicCode('tbwb9e', fetchImpl as any);
        expect(r.ok).toBe(true);
        expect(r.entity).toEqual({ publicCode: 'tbwb9e', name: 'Lobster', character: 'crab' });
        // No leakage of anything beyond the three whitelisted public fields.
        expect(Object.keys(r.entity as object).sort()).toEqual(['character', 'name', 'publicCode']);

        // It hit the lookup endpoint with a named UA (CF-1010 avoidance).
        const call = (fetchImpl.mock.calls as any[])[0];
        const url = call[0];
        const init = call[1];
        expect(String(url)).toContain('/api/entity/lookup?code=tbwb9e');
        expect((init as any).headers['User-Agent']).toBe('curl/8.4.0');
    });

    it('rejects a spoofed / unknown code (EClaw 404 → not_found)', async () => {
        const fetchImpl = jest.fn(async () => mkResp(404, { success: false }));
        const r = await verifyPublicCode('zzzzzz', fetchImpl as any);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('not_found');
    });

    it('rejects when EClaw returns 200 but success:false (defensive)', async () => {
        const fetchImpl = jest.fn(async () => mkResp(200, { success: false }));
        const r = await verifyPublicCode('tbwb9e', fetchImpl as any);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('not_found');
    });

    it('never calls the network for a malformed code', async () => {
        const fetchImpl = jest.fn();
        const r = await verifyPublicCode('BAD!!', fetchImpl as any);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('bad_format');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fails closed (untrusted) when EClaw is down / 5xx', async () => {
        const fetchImpl = jest.fn(async () => mkResp(503, { error: 'down' }));
        const r = await verifyPublicCode('tbwb9e', fetchImpl as any);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('upstream_error');
    });

    it('fails closed when fetch itself throws', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('ECONNREFUSED');
        });
        const r = await verifyPublicCode('tbwb9e', fetchImpl as any);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('upstream_error');
    });
});

describe('resolveProxyIdentity (parse + verify combined)', () => {
    it('returns the verified entity for a real eclaw: envelope', async () => {
        const fetchImpl = jest.fn(async () =>
            mkResp(200, { success: true, entity: { publicCode: '3xa3h4', name: 'A', character: 'b' } })
        );
        const ent = await resolveProxyIdentity('eclaw:3xa3h4', fetchImpl as any);
        expect(ent).toEqual({ publicCode: '3xa3h4', name: 'A', character: 'b' });
    });

    it('returns null for a spoofed proxy_end_user_id that does not resolve', async () => {
        const fetchImpl = jest.fn(async () => mkResp(404, { success: false }));
        const ent = await resolveProxyIdentity('eclaw:zzzzzz', fetchImpl as any);
        expect(ent).toBeNull();
    });

    it('returns null (no network) for a non-eclaw proxy id — never trusts the raw field', async () => {
        const fetchImpl = jest.fn();
        const ent = await resolveProxyIdentity('external-user-9000', fetchImpl as any);
        expect(ent).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
