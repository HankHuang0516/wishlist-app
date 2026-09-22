export type EclawRecognitionResult = {
    name: string;
    price: number | null;
    currency: string | null;
    tags: string[];
    shoppingLink: string | null;
    description: string | null;
};

type Fetch = typeof fetch;

export type EclawRecognitionConfig = {
    baseUrl: string;
    deviceId: string;
    deviceSecret: string;
    entityId: number;
    pollIntervalMs: number;
    replyTimeoutMs: number;
};

type HistoryMessage = {
    id?: unknown;
    entity_id?: unknown;
    text?: unknown;
    is_from_bot?: unknown;
    created_at?: unknown;
};

export class EclawRecognitionError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'EclawRecognitionError';
    }
}

export function loadEclawRecognitionConfig(env: NodeJS.ProcessEnv = process.env): EclawRecognitionConfig | null {
    const deviceId = env.ECLAW_RECOGNITION_DEVICE_ID?.trim();
    const deviceSecret = env.ECLAW_RECOGNITION_DEVICE_SECRET?.trim();
    if (!deviceId || !deviceSecret) return null;
    const entityId = Number(env.ECLAW_RECOGNITION_ENTITY_ID ?? '0');
    if (!Number.isInteger(entityId) || entityId < 0) throw new Error('ECLAW_RECOGNITION_ENTITY_ID must be a non-negative integer');
    const pollIntervalMs = boundedInteger(env.ECLAW_RECOGNITION_POLL_MS, 1500, 250, 10000);
    const replyTimeoutMs = boundedInteger(env.ECLAW_RECOGNITION_TIMEOUT_MS, 120000, 5000, 300000);
    return {
        baseUrl: (env.ECLAW_RECOGNITION_BASE_URL || 'https://eclawbot.com').replace(/\/$/, ''),
        deviceId,
        deviceSecret,
        entityId,
        pollIntervalMs,
        replyTimeoutMs,
    };
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Expected integer from ${minimum} to ${maximum}`);
    return value;
}

async function requestJson(fetchImpl: Fetch, url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new EclawRecognitionError(`EClaw HTTP ${response.status}`, response.status >= 500 ? 'UPSTREAM' : 'REJECTED');
        return body as Record<string, unknown>;
    } catch (error: any) {
        if (error instanceof EclawRecognitionError) throw error;
        if (controller.signal.aborted || error?.name === 'AbortError') throw new EclawRecognitionError('EClaw request timed out', 'TIMEOUT');
        throw new EclawRecognitionError('EClaw request failed', 'NETWORK');
    } finally {
        clearTimeout(timer);
    }
}

async function readHistory(config: EclawRecognitionConfig, fetchImpl: Fetch): Promise<HistoryMessage[]> {
    const query = new URLSearchParams({
        deviceId: config.deviceId,
        deviceSecret: config.deviceSecret,
        limit: '50',
    });
    const body = await requestJson(fetchImpl, `${config.baseUrl}/api/chat/history?${query}`, { method: 'GET' }, 10000);
    if (!Array.isArray(body.messages)) throw new EclawRecognitionError('EClaw history response was invalid', 'BAD_RESPONSE');
    return body.messages as HistoryMessage[];
}

function isBotMessage(message: HistoryMessage, entityId: number) {
    return Number(message.entity_id) === entityId && (message.is_from_bot === true || message.is_from_bot === 't');
}

function buildPrompt(jobId: string, resourceUrl: string, currentName: string) {
    return [
        `WISHLIST_AI_JOB:${jobId}`,
        '你是 Wishlist.ai 的商品辨識代理。請查看附件圖片或下方公開網址，辨識實際商品；看不清楚的欄位請填 null，不可捏造品牌或型號。',
        `目前暫存名稱：${currentName.slice(0, 200)}`,
        `商品資源網址：${resourceUrl}`,
        '只回覆一個 JSON 物件，不要 Markdown、不要解說。格式：',
        `{"jobId":"${jobId}","name":"商品名稱","price":null,"currency":"TWD","tags":["標籤"],"shoppingLink":null,"description":"兩句內繁體中文描述"}`,
    ].join('\n');
}

export async function recognizeWithEclaw(
    input: { jobId: string; resourceUrl: string; currentName: string },
    config: EclawRecognitionConfig,
    fetchImpl: Fetch = fetch,
): Promise<EclawRecognitionResult> {
    const resource = safePublicResourceUrl(input.resourceUrl);
    const before = await readHistory(config, fetchImpl);
    const existingIds = new Set(before.map(row => typeof row.id === 'string' ? row.id : '').filter(Boolean));
    const prompt = buildPrompt(input.jobId, resource, input.currentName);
    const sentAt = Date.now();
    const sendBody = await requestJson(fetchImpl, `${config.baseUrl}/api/client/speak`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': input.jobId },
        body: JSON.stringify({
            deviceId: config.deviceId,
            deviceSecret: config.deviceSecret,
            entityId: config.entityId,
            text: prompt,
            source: 'wishlist-ai',
            mediaType: isLikelyImageResourceUrl(resource) ? 'photo' : undefined,
            mediaUrl: isLikelyImageResourceUrl(resource) ? resource : undefined,
        }),
    }, 60000);
    if (sendBody.success !== true) throw new EclawRecognitionError('EClaw did not accept the recognition job', 'DISPATCH_FAILED');

    const deadline = Date.now() + config.replyTimeoutMs;
    while (Date.now() < deadline) {
        const rows = await readHistory(config, fetchImpl);
        const reply = rows.find(row => {
            if (!isBotMessage(row, config.entityId) || typeof row.id !== 'string' || existingIds.has(row.id) || typeof row.text !== 'string') return false;
            const created = Date.parse(String(row.created_at || ''));
            return (!Number.isFinite(created) || created >= sentAt - 2000) && row.text.includes(input.jobId);
        });
        if (reply && typeof reply.text === 'string') return parseRecognitionReply(reply.text, input.jobId);
        await new Promise(resolve => setTimeout(resolve, Math.min(config.pollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
    throw new EclawRecognitionError('EClaw recognition reply timed out', 'NO_REPLY');
}

export function isLikelyImageResourceUrl(url: string) {
    try {
        const parsed = new URL(url);
        return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname) || /(?:flickr|staticflickr|images|img|cdn)/i.test(parsed.hostname);
    } catch { return false; }
}

export function safePublicResourceUrl(raw: string) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new EclawRecognitionError('Recognition resource URL was invalid', 'BAD_INPUT'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
        throw new EclawRecognitionError('Recognition resource must be a public HTTPS URL', 'BAD_INPUT');
    }
    return url.href;
}

export function parseRecognitionReply(text: string, expectedJobId: string): EclawRecognitionResult {
    const withoutFence = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const start = withoutFence.indexOf('{'), end = withoutFence.lastIndexOf('}');
    if (start < 0 || end <= start) throw new EclawRecognitionError('EClaw reply did not contain JSON', 'BAD_RESPONSE');
    let raw: any;
    try { raw = JSON.parse(withoutFence.slice(start, end + 1)); }
    catch { throw new EclawRecognitionError('EClaw reply JSON was invalid', 'BAD_RESPONSE'); }
    if (!raw || typeof raw !== 'object' || raw.jobId !== expectedJobId) throw new EclawRecognitionError('EClaw reply job id did not match', 'BAD_RESPONSE');
    const name = cleanText(raw.name, 200);
    if (!name) throw new EclawRecognitionError('EClaw reply was missing a product name', 'BAD_RESPONSE');
    const price = raw.price === null || raw.price === undefined || raw.price === '' ? null : Number(raw.price);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e12)) throw new EclawRecognitionError('EClaw reply price was invalid', 'BAD_RESPONSE');
    const currency = cleanText(raw.currency, 8)?.toUpperCase() ?? null;
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new EclawRecognitionError('EClaw reply currency was invalid', 'BAD_RESPONSE');
    const tags = Array.isArray(raw.tags) ? raw.tags.map((v: unknown) => cleanText(v, 30)).filter((v: string | null): v is string => !!v).slice(0, 5) : [];
    const shoppingLink = optionalHttpsUrl(raw.shoppingLink);
    return { name, price, currency, tags, shoppingLink, description: cleanText(raw.description, 500) };
}

function cleanText(value: unknown, maximum: number) {
    if (typeof value !== 'string') return null;
    const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return result ? result.slice(0, maximum) : null;
}

function optionalHttpsUrl(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') throw new EclawRecognitionError('EClaw shopping link was invalid', 'BAD_RESPONSE');
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) throw new Error();
        return url.href;
    } catch { throw new EclawRecognitionError('EClaw shopping link was invalid', 'BAD_RESPONSE'); }
}
