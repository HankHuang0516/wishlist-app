export type EclawRecognitionResult = {
    name: string;
    brand: string | null;
    model: string | null;
    category: string | null;
    condition: string | null;
    price: number;
    priceLow: number;
    priceHigh: number;
    currency: string;
    priceBasis: string;
    tags: string[];
    keyFeatures: string[];
    confidence: number | null;
    uncertainties: string[];
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
        '你是 Wishlist.ai 的資深商品鑑識與估價代理。請仔細查看附件圖片或下方公開網址，先依外觀、標誌、型號字樣、包裝與配件交叉判斷，再輸出結果。',
        '不可因相似外觀猜測品牌或型號；看不清楚、無法由圖片支持或價格資料不足的欄位必須填 null，並寫入 uncertainties。',
        'price、priceLow、priceHigh、currency、priceBasis 都是必填且不得為 null。price 是目前市場的代表成交／售價估計，priceLow 與 priceHigh 是合理區間，三者使用同一 currency。',
        '即使看不出精確型號，也要依可確認的商品品類、外觀狀況與台灣市場行情給出保守估價；priceBasis 清楚標示「品類估算」及估價依據，並把型號或規格不確定性寫入 uncertainties。',
        '二手品請依可見磨損、包裝、配件與外觀描述 condition；無法判斷新品或二手時填 null。confidence 為 0 到 1，反映整體辨識可信度。',
        `目前暫存名稱：${currentName.slice(0, 200)}`,
        `商品資源網址：${resourceUrl}`,
        '只回覆一個 JSON 物件，不要 Markdown、不要解說。格式：',
        `{"jobId":"${jobId}","name":"精確商品名稱","brand":null,"model":null,"category":"品類","condition":null,"price":1000,"priceLow":800,"priceHigh":1200,"currency":"TWD","priceBasis":"台灣市場新品／二手行情或品類估算依據","tags":["最多5個標籤"],"keyFeatures":["最多6個可見或可確認特徵"],"confidence":0.0,"uncertainties":["最多4個不確定項"],"shoppingLink":null,"description":"四句內繁體中文詳細摘要"}`,
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
        return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname) || /(?:flickr|staticflickr|images|img|cdn)/i.test(parsed.hostname) || /^\/api\/listing-media\/[0-9a-f-]{36}\/image$/.test(parsed.pathname);
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
    const price = requiredPrice(raw.price, 'price');
    const priceLow = requiredPrice(raw.priceLow, 'priceLow');
    const priceHigh = requiredPrice(raw.priceHigh, 'priceHigh');
    if (priceLow > priceHigh || price < priceLow || price > priceHigh) throw new EclawRecognitionError('EClaw reply price range was invalid', 'BAD_RESPONSE');
    const currency = cleanText(raw.currency, 8)?.toUpperCase() ?? null;
    if (currency === null) throw new EclawRecognitionError('EClaw reply price currency was missing', 'INCOMPLETE_ESTIMATE');
    if (!/^[A-Z]{3}$/.test(currency)) throw new EclawRecognitionError('EClaw reply currency was invalid', 'BAD_RESPONSE');
    const priceBasis = cleanText(raw.priceBasis, 240);
    if (!priceBasis) throw new EclawRecognitionError('EClaw reply price basis was missing', 'INCOMPLETE_ESTIMATE');
    const tags = Array.isArray(raw.tags) ? raw.tags.map((v: unknown) => cleanText(v, 30)).filter((v: string | null): v is string => !!v).slice(0, 5) : [];
    const keyFeatures = textArray(raw.keyFeatures, 6, 100);
    const uncertainties = textArray(raw.uncertainties, 4, 120);
    const confidence = raw.confidence === null || raw.confidence === undefined || raw.confidence === '' ? null : Number(raw.confidence);
    if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new EclawRecognitionError('EClaw reply confidence was invalid', 'BAD_RESPONSE');
    const shoppingLink = optionalHttpsUrl(raw.shoppingLink);
    return {
        name, brand: cleanText(raw.brand, 100), model: cleanText(raw.model, 100), category: cleanText(raw.category, 100), condition: cleanText(raw.condition, 120),
        price, priceLow, priceHigh, currency, priceBasis, tags, keyFeatures, confidence, uncertainties,
        shoppingLink, description: cleanText(raw.description, 800),
    };
}

function requiredPrice(value: unknown, field: string) {
    if (value === null || value === undefined || value === '') throw new EclawRecognitionError(`EClaw reply ${field} was missing`, 'INCOMPLETE_ESTIMATE');
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0 || price > 1e12) throw new EclawRecognitionError(`EClaw reply ${field} was invalid`, 'BAD_RESPONSE');
    return price;
}

function textArray(value: unknown, maximumItems: number, maximumLength: number) {
    return Array.isArray(value) ? value.map(v => cleanText(v, maximumLength)).filter((v): v is string => !!v).slice(0, maximumItems) : [];
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
