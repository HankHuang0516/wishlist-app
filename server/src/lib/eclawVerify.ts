/**
 * EClaw agent verification (write-path authentication)
 * -----------------------------------------------------
 * Owner directive (card_e30cf03d): the Wishlist WRITE path must NOT use a shared
 * merchant key. Instead an EClaw agent proves its OWN EClaw identity and this
 * backend verifies that identity against EClaw before allowing the write.
 *
 * TWO PROOFS (both resolve to the agent's OWN publicCode, verified by EClaw):
 *
 *   1. TOKEN (preferred). The agent presents a SHORT-LIVED, EClaw-issued token
 *      (header `x-eclaw-agent-token`). We POST it to EClaw's
 *      `/api/agent-identity/verify`, which returns { valid, publicCode }. The
 *      raw long-lived bot secret is therefore never sent to this service.
 *
 *   2. BOT-SECRET TRANSIENT (fallback). The agent forwards its
 *      { deviceId, entityId, botSecret } (headers `x-eclaw-device-id` /
 *      `x-eclaw-entity-id` / `x-eclaw-bot-secret`). We POST that triple to the
 *      SAME verify endpoint; EClaw checks it and returns { valid, publicCode }.
 *
 * SECURITY INVARIANTS
 *   - The token / bot secret is VERIFY-THEN-DISCARD: it is never persisted to the
 *     DB and never logged. Only the resolved `publicCode` is used downstream.
 *   - Trust is granted ONLY on a live 200 { valid:true } from EClaw. Anything
 *     else — invalid, spoofed, malformed, or an EClaw outage — is untrusted, and
 *     the caller MUST treat an outage as FAIL-CLOSED (no write).
 *   - Outbound requests use a named User-Agent because an empty / default UA can
 *     trip Cloudflare's edge UA filter (HTTP 1010).
 *   - The verifier is injectable (`fetchImpl`) so it can be unit-tested with no
 *     network.
 */

export const ECLAW_VERIFY_BASE =
    process.env.ECLAW_LOOKUP_BASE || process.env.ECLAW_VERIFY_BASE || 'https://eclawbot.com';

// Header names the write path reads. Token is preferred; the triple is fallback.
export const AGENT_TOKEN_HEADER = 'x-eclaw-agent-token';
export const AGENT_DEVICE_ID_HEADER = 'x-eclaw-device-id';
export const AGENT_ENTITY_ID_HEADER = 'x-eclaw-entity-id';
export const AGENT_BOT_SECRET_HEADER = 'x-eclaw-bot-secret';

const OUTBOUND_UA = 'curl/8.4.0';

// Public codes are 6 lowercase-alnum chars (EClaw channel-api generatePublicCode).
const PUBLIC_CODE_PATTERN = /^[a-z0-9]{6}$/;

export interface EclawAgentVerifyResult {
    /** true only on a live EClaw 200 { valid:true, publicCode }. */
    ok: boolean;
    /** Present only when ok === true. The agent's OWN verified public code. */
    publicCode?: string;
    /** Machine-readable reason when ok === false. */
    reason?: 'no_credentials' | 'invalid' | 'upstream_error';
}

type FetchLike = (
    input: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
        redirect?: 'manual' | 'follow' | 'error';
    }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * The identity proof extracted from a request. Exactly one of `token` or the
 * `{deviceId, entityId, botSecret}` triple should be present. This value is
 * NEVER stored or logged.
 */
export interface EclawAgentCredentials {
    token?: string;
    deviceId?: string;
    entityId?: string | number;
    botSecret?: string;
}

/**
 * Pull EClaw agent credentials out of the request headers. Prefers the token.
 * Returns null if no usable proof is present. Does NOT verify anything.
 */
export function extractAgentCredentials(headers: Record<string, unknown>): EclawAgentCredentials | null {
    const get = (k: string): string | undefined => {
        const v = headers[k] ?? headers[k.toLowerCase()];
        if (typeof v === 'string' && v.length > 0) return v;
        if (Array.isArray(v) && typeof v[0] === 'string' && v[0].length > 0) return v[0];
        return undefined;
    };
    const token = get(AGENT_TOKEN_HEADER);
    if (token) return { token };
    const deviceId = get(AGENT_DEVICE_ID_HEADER);
    const entityId = get(AGENT_ENTITY_ID_HEADER);
    const botSecret = get(AGENT_BOT_SECRET_HEADER);
    if (deviceId && entityId && botSecret) return { deviceId, entityId, botSecret };
    return null;
}

/**
 * Verify an EClaw agent identity by calling back to EClaw's verify endpoint.
 * Trust is granted ONLY on a live 200 { valid:true, publicCode }. An EClaw
 * outage / non-200 / network error → { ok:false, reason:'upstream_error' } so
 * the caller can FAIL CLOSED. The credentials are used once and discarded.
 *
 * @param creds     token OR {deviceId,entityId,botSecret}; never stored/logged
 * @param fetchImpl injectable fetch (defaults to global fetch)
 */
export async function verifyEclawAgent(
    creds: EclawAgentCredentials | null,
    fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike
): Promise<EclawAgentVerifyResult> {
    if (!creds || (!creds.token && !(creds.deviceId && creds.entityId && creds.botSecret))) {
        return { ok: false, reason: 'no_credentials' };
    }

    const url = `${ECLAW_VERIFY_BASE}/api/agent-identity/verify`;
    // Build the smallest possible body: prefer the token; else the triple.
    const payload: Record<string, unknown> = creds.token
        ? { token: creds.token }
        : { deviceId: creds.deviceId, entityId: creds.entityId, botSecret: creds.botSecret };

    let resp: Awaited<ReturnType<FetchLike>>;
    try {
        // 5s timeout so a slow EClaw never wedges a wishlist write.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            resp = await fetchImpl(url, {
                method: 'POST',
                headers: {
                    'User-Agent': OUTBOUND_UA,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
                // A 3xx from a compromised/misconfigured upstream must never bounce
                // this identity check to an attacker host → treat as untrusted.
                redirect: 'manual',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return { ok: false, reason: 'upstream_error' };
    }

    // EClaw returns 200 for both valid and invalid identities (valid:false); a
    // non-200 (500/502/timeout) is an outage → fail closed.
    if (!resp.ok) return { ok: false, reason: 'upstream_error' };

    let body: any;
    try {
        body = await resp.json();
    } catch {
        return { ok: false, reason: 'upstream_error' };
    }

    const normalizedCode = String(body?.publicCode || '').trim().toLowerCase();
    if (!body || body.valid !== true || !PUBLIC_CODE_PATTERN.test(normalizedCode)) {
        return { ok: false, reason: 'invalid' };
    }
    return { ok: true, publicCode: normalizedCode };
}
