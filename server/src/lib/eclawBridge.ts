/**
 * EClaw account bridge (green channel)
 * -------------------------------------
 * Maps an EClaw *public code* to a trusted identity primitive for the
 * wishlist matchmaking flow. An item may carry `proxy_end_user_id` in the
 * form `eclaw:<publicCode>` (6-char code). That field is UNTRUSTED input:
 * anyone can write any string into it via the merchant write path, so we
 * MUST NOT derive trust from it directly.
 *
 * Trust is established ONLY by resolving the code against EClaw's public-code
 * index over the network:
 *     GET https://eclawbot.com/api/entity/lookup?code=<publicCode>
 *       -> 200 { success:true, entity:{ publicCode, name, character, ... } }
 *       -> 404 { success:false }   (unknown / unbound code -> spoof)
 *
 * A caller claiming `eclaw:<code>` is trusted only after this resolves to a
 * real, bound EClaw entity. We never leak PII derived from proxy_end_user_id;
 * we only surface the entity's public, self-chosen display fields.
 *
 * The resolver is injectable (`fetchImpl`) so it can be unit-tested with no
 * network. All outbound requests use a named User-Agent because an empty /
 * default UA can trip Cloudflare's edge UA filter (HTTP 1010).
 */

export const ECLAW_PUBLIC_CODE_PREFIX = 'eclaw:';
export const ECLAW_LOOKUP_BASE =
    process.env.ECLAW_LOOKUP_BASE || 'https://eclawbot.com';
// EClaw public codes are 6 lowercase-alnum chars (see channel-api generatePublicCode).
export const ECLAW_PUBLIC_CODE_PATTERN = /^[a-z0-9]{6}$/;

const OUTBOUND_UA = 'curl/8.4.0';

export interface ResolvedEclawEntity {
    publicCode: string;
    name: string | null;
    character: string | null;
    // Only public, self-chosen display fields are surfaced. Never PII.
}

export interface EclawResolveResult {
    ok: boolean;
    /** Present only when ok === true. */
    entity?: ResolvedEclawEntity;
    /** Machine-readable reason when ok === false. */
    reason?: 'not_eclaw' | 'bad_format' | 'not_found' | 'upstream_error';
}

type FetchLike = (
    input: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        signal?: AbortSignal;
        redirect?: 'manual' | 'follow' | 'error';
    }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * Extract a bare public code from an untrusted proxy_end_user_id.
 * Returns null if the value is not an `eclaw:<6-char-code>` envelope.
 * This does NOT prove the code is real — call verifyPublicCode for that.
 */
export function parseEclawPublicCode(proxyEndUserId: unknown): string | null {
    if (typeof proxyEndUserId !== 'string') return null;
    // Case-insensitive prefix match — `ECLAW:...` must not slip past as an
    // opaque (unverified) external id and thereby bypass verification.
    const lower = proxyEndUserId.toLowerCase();
    if (!lower.startsWith(ECLAW_PUBLIC_CODE_PREFIX)) return null;
    const code = lower.slice(ECLAW_PUBLIC_CODE_PREFIX.length).trim();
    if (!ECLAW_PUBLIC_CODE_PATTERN.test(code)) return null;
    return code;
}

/**
 * Resolve + verify an EClaw public code against the live public-code index.
 * Trust is granted only on a 200 from EClaw. Anything else is untrusted.
 *
 * @param code    a bare 6-char public code (NOT the `eclaw:` envelope)
 * @param fetchImpl injectable fetch (defaults to global fetch)
 */
export async function verifyPublicCode(
    code: string,
    fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike
): Promise<EclawResolveResult> {
    if (!ECLAW_PUBLIC_CODE_PATTERN.test(code)) {
        return { ok: false, reason: 'bad_format' };
    }

    const url = `${ECLAW_LOOKUP_BASE}/api/entity/lookup?code=${encodeURIComponent(code)}`;

    let resp: Awaited<ReturnType<FetchLike>>;
    try {
        // 5s timeout so a slow EClaw never wedges a wishlist request.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            resp = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    'User-Agent': OUTBOUND_UA,
                    Accept: 'application/json',
                },
                // Do NOT follow redirects: a 3xx from a compromised/misconfigured
                // upstream must never bounce this authenticated-ish lookup to an
                // attacker host. A redirect is treated as a non-200 → untrusted.
                redirect: 'manual',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return { ok: false, reason: 'upstream_error' };
    }

    if (resp.status === 404) return { ok: false, reason: 'not_found' };
    if (!resp.ok) return { ok: false, reason: 'upstream_error' };

    let body: any;
    try {
        body = await resp.json();
    } catch {
        return { ok: false, reason: 'upstream_error' };
    }

    if (!body || body.success !== true || !body.entity || !body.entity.publicCode) {
        return { ok: false, reason: 'not_found' };
    }

    // Surface ONLY public display fields. Never echo anything PII-derived.
    return {
        ok: true,
        entity: {
            publicCode: String(body.entity.publicCode),
            name: body.entity.name != null ? String(body.entity.name) : null,
            character: body.entity.character != null ? String(body.entity.character) : null,
        },
    };
}

/**
 * Convenience: given an untrusted proxy_end_user_id, return the VERIFIED
 * EClaw entity or null. Combines parse + network verify. Use this before
 * ever trusting an `eclaw:<code>` identity for matchmaking.
 */
export async function resolveProxyIdentity(
    proxyEndUserId: unknown,
    fetchImpl?: FetchLike
): Promise<ResolvedEclawEntity | null> {
    const code = parseEclawPublicCode(proxyEndUserId);
    if (!code) return null;
    const result = await verifyPublicCode(code, fetchImpl);
    return result.ok && result.entity ? result.entity : null;
}
