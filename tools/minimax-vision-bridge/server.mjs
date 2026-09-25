import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4096;
const JOB_TTL_MS = 60 * 60 * 1000;
const DEFAULT_IMAGE_HOST = 'wishlist-app-production.up.railway.app';
const blockedIpv4 = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4]]) blockedIpv4.addSubnet(network, prefix, 'ipv4');

export function isPublicIpv4(address) { return isIP(address) === 4 && !blockedIpv4.check(address, 'ipv4'); }

export function validExternalImageUrl(raw, host) {
    try {
        const url = new URL(raw);
        return typeof host === 'string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host) &&
            url.protocol === 'https:' && url.hostname === host && !url.port && !url.username && !url.password &&
            url.pathname !== '/' && !url.hash;
    } catch { return false; }
}

export async function pinnedExternalFetch(raw, { imageHost, signal, lookup = dnsLookup, request = https.request } = {}) {
    if (!validExternalImageUrl(raw, imageHost)) throw new Error('IMAGE_HOST_UNSAFE');
    const url = new URL(raw);
    const activeSignal = signal ?? AbortSignal.timeout(45_000);
    if (activeSignal.aborted) throw new Error('IMAGE_FETCH_FAILED');
    let onLookupAbort;
    const cancelledLookup = new Promise((_, reject) => {
        onLookupAbort = () => reject(new Error('IMAGE_FETCH_FAILED'));
        activeSignal.addEventListener('abort', onLookupAbort, { once: true });
    });
    let addresses;
    try { addresses = await Promise.race([lookup(imageHost, { all: true }), cancelledLookup]); }
    catch { throw new Error('IMAGE_FETCH_FAILED'); }
    finally { activeSignal.removeEventListener('abort', onLookupAbort); }
    if (activeSignal.aborted) throw new Error('IMAGE_FETCH_FAILED');
    const ipv4 = addresses.filter(entry => entry.family === 4);
    if (!ipv4.length || ipv4.some(entry => !isPublicIpv4(entry.address))) throw new Error('IMAGE_HOST_UNSAFE');
    return new Promise((resolve, reject) => {
        let req;
        const cleanup = () => activeSignal.removeEventListener('abort', onAbort);
        const onAbort = () => { cleanup(); req.destroy(new Error('IMAGE_FETCH_FAILED')); reject(new Error('IMAGE_FETCH_FAILED')); };
        req = request(url, { method: 'GET', agent: false, timeout: 20_000,
            headers: { Accept: 'image/jpeg,image/png,image/webp' },
            lookup: (_hostname, options, callback) => options.all
                ? callback(null, [{ address: ipv4[0].address, family: 4 }])
                : callback(null, ipv4[0].address, 4) }, response => {
            response.once('end', cleanup);
            response.once('close', cleanup);
            response.once('error', cleanup);
            if (response.statusCode !== 200) {
                cleanup(); response.destroy(); reject(new Error('IMAGE_FETCH_FAILED')); return;
            }
            resolve({ ok: true, body: response, headers: { get: key => response.headers[key]?.toString() ?? null } });
        });
        req.on('error', () => { cleanup(); reject(new Error('IMAGE_FETCH_FAILED')); });
        req.on('timeout', () => req.destroy(new Error('IMAGE_FETCH_FAILED')));
        activeSignal.addEventListener('abort', onAbort, { once: true });
        if (activeSignal.aborted) { onAbort(); return; }
        req.end();
    });
}

export function validImageUrl(raw, host = DEFAULT_IMAGE_HOST) {
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password &&
            !url.search && !url.hash && /^\/api\/listing-media\/[0-9a-f-]{36}\/image$/.test(url.pathname);
    } catch { return false; }
}

function clean(value, max = 160) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function textArray(value, maxItems, maxChars) {
    return Array.isArray(value) ? value.map(item => clean(item, maxChars)).filter(Boolean).slice(0, maxItems) : [];
}

export function parseVisionDescription(description) {
    if (typeof description !== 'string') throw new Error('VISION_BAD_RESPONSE');
    const start = description.indexOf('{'), end = description.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('VISION_BAD_RESPONSE');
    let raw;
    try { raw = JSON.parse(description.slice(start, end + 1)); }
    catch { throw new Error('VISION_BAD_RESPONSE'); }
    const name = clean(raw.name), category = clean(raw.category, 80);
    const visibleText = textArray(raw.visibleText, 12, 100);
    const evidence = textArray(raw.evidence, 5, 160);
    const uncertainties = textArray(raw.uncertainties, 4, 160);
    const confidence = Number(raw.confidence);
    if (raw.recognizable !== true || !name || evidence.length < 2 || !Number.isFinite(confidence) || confidence < 0.65 || confidence > 1) {
        throw new Error('VISION_UNCERTAIN');
    }
    const statedPrice = raw.listedPriceTwd === null || raw.listedPriceTwd === undefined ? null : Number(raw.listedPriceTwd);
    const textPrices = [...new Set(visibleText.flatMap(line => [...line.matchAll(/(\d{1,7})\s*元/g)].map(match => Number(match[1]))))];
    const statedIsVisible = statedPrice !== null && Number.isFinite(statedPrice) && statedPrice >= 0 && statedPrice <= 1_000_000 && textPrices.includes(statedPrice);
    const isPrintedOffer = /招牌|菜單|價目|廣告/.test(`${name} ${category}`);
    const listedPriceTwd = isPrintedOffer && (statedIsVisible || textPrices.length === 1) ? (statedIsVisible ? statedPrice : textPrices[0]) : null;
    return { name, category: category || null, visibleText, listedPriceTwd, evidence, uncertainties, confidence };
}

async function boundedImage(url, fetchImpl, authToken, timeoutMs = 20000) {
    let response;
    try { response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}) }); }
    catch { throw new Error('IMAGE_FETCH_FAILED'); }
    if (!response.ok || !response.body) throw new Error('IMAGE_FETCH_FAILED');
    const mime = response.headers.get('content-type')?.split(';')[0].toLowerCase();
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    if (!extension) throw new Error('IMAGE_FORMAT_UNSUPPORTED');
    if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    const chunks = [];
    let length = 0;
    try {
        for await (const chunk of response.body) {
            length += chunk.length;
            if (length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
            chunks.push(chunk);
        }
    } catch (error) {
        if (error?.message === 'IMAGE_TOO_LARGE') throw error;
        throw new Error('IMAGE_FETCH_FAILED');
    }
    const bytes = Buffer.concat(chunks, length);
    const validMagic = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 :
        mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
        bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!validMagic) throw new Error('IMAGE_FORMAT_UNSUPPORTED');
    return { bytes, extension };
}

const PROMPT = [
    '只根據圖片像素辨識主要物品或印刷招牌，不要根據網址、檔名或先前文字猜測。',
    '先逐一辨認同等重要的可見主體，再寫 name。若可由外形、配色和標誌可靠辨認具體角色或品項，name 必須寫出這些名稱與商品型態，不能只寫「模型」、「玩具」、「商品」或系列泛稱。若有多個主體，name 應涵蓋各主體；無法確定專名時，改用數量、顏色與外形描述，不要猜。',
    'evidence 應分別指出支撐 name 的可見特徵；若 evidence 比 name 更具體，先修正 name。不可把圖片裡沒有證實的品牌、型號或授權狀態寫成確定事實。',
    '要區分商品實物、模型公仔和商品廣告；招牌上的明示售價不是二手市場估價。',
    '如果是招牌或菜單，name 應包含最主要、清楚可讀的品項名稱與「招牌」，不可僅寫「攤位招牌」。listedPriceTwd 只填該主品項明示的數字價格；沒有明示就填 null。',
    '看不到品牌、型號、材質或新舊就不要猜。用繁體中文，僅輸出一個 JSON 物件，不要 Markdown。',
    '{"recognizable":true,"name":"主體名稱","category":"品類","visibleText":["確實可讀的文字"],"listedPriceTwd":null,"evidence":["可見證據1","可見證據2"],"uncertainties":["無法確認的部分"],"confidence":0.8}',
].join('\n');

// Keep the vision instruction compact: the Connector has returned detailed JSON
// for this shape, while the longer policy-style prompt repeatedly timed out.
const LISTING_PROMPT = '只依照片像素，以繁體中文 JSON 寫尚未公開的二手商品草稿：recognizable,name,description(可見外觀與瑕疵、賣家待確認),category(electronics/home/fashion/sports/books/toys/other),brand(不確定null),condition(NEW/USED/null),estimatedPriceLowTwd,estimatedPriceHighTwd,priceBasis,evidence(至少2項陣列),uncertainties(陣列),confidence(0到1)。不要猜品牌或已測功能。二手價格可依可見品類與磨損作極保守、較寬的台幣參考區間；無法辨識或無法估計則null。未測試功能的電器要納入故障風險，不可用正常品價格。priceBasis註明「僅依照片粗估，非即時行情」。不得輸出私人聯絡資訊。只輸出JSON。';
const EXTERNAL_CANDIDATE_PROMPT = '只依照片像素，用繁體中文 JSON 寫供後台人工審查的二手商品圖片補充建議：recognizable,name,description(可見外觀與瑕疵，不要捏造測試結果),category(electronics/home/fashion/sports/books/toys/other),brand(不確定null),condition(null),estimatedPriceLowTwd(null),estimatedPriceHighTwd(null),priceBasis(null),evidence(至少2項陣列),uncertainties(陣列),confidence(0到1)。不可臆測價格、賣家、地點或授權；不可輸出聯絡資訊。只輸出JSON。';

export function parseListingVisionDescription(description) {
    if (typeof description !== 'string') throw new Error('VISION_BAD_RESPONSE');
    const start = description.indexOf('{'), end = description.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('VISION_BAD_RESPONSE');
    let raw;
    try { raw = JSON.parse(description.slice(start, end + 1)); }
    catch { throw new Error('VISION_BAD_RESPONSE'); }
    const name = clean(raw.name, 100), details = clean(raw.description, 1500);
    const evidence = textArray(raw.evidence, 6, 160);
    const uncertainties = textArray(Array.isArray(raw.uncertainties) ? raw.uncertainties : [raw.uncertainties], 6, 160);
    const confidence = Number(raw.confidence);
    if (raw.recognizable !== true || name.length < 3 || details.length < 16 || evidence.length < 2 ||
        !Number.isFinite(confidence) || confidence < 0.7 || confidence > 1) throw new Error('VISION_UNCERTAIN');
    if (/(?:^|\D)09\d{8}(?:\D|$)/.test(`${name} ${details}`) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(`${name} ${details}`)) throw new Error('VISION_PRIVATE_CONTACT');
    const categories = new Set(['electronics', 'home', 'fashion', 'sports', 'books', 'toys', 'other']);
    const amount = x => Number.isSafeInteger(x) && x >= 0 && x <= 1_000_000 ? x : null;
    const low = amount(raw.estimatedPriceLowTwd), high = amount(raw.estimatedPriceHighTwd);
    const priceValid = confidence >= 0.8 && low !== null && high !== null && high >= low && high <= Math.max(100, low * 10);
    return { recognizable: true, name, description: details, category: categories.has(raw.category) ? raw.category : 'other',
        brand: clean(raw.brand, 60) || null, condition: ['NEW', 'USED'].includes(raw.condition) ? raw.condition : null,
        estimatedPriceLowTwd: priceValid ? low : null, estimatedPriceHighTwd: priceValid ? high : null,
        priceBasis: priceValid ? '僅依照片外觀與模型既有知識粗估；未查詢即時市場成交價，請賣家確認' : null,
        evidence, uncertainties, confidence };
}

async function describeImage(url, prompt, parse, { fetchImpl = fetch, command = 'mcode-tools', authToken, execCommand = execFileAsync,
    connectorTimeoutMs = 90000, imageTimeoutMs = 20000 } = {}) {
    const { bytes, extension } = await boundedImage(url, fetchImpl, authToken, imageTimeoutMs);
    const directory = await mkdtemp(join(tmpdir(), 'wishlist-minimax-vision-'));
    const imagePath = join(directory, `image.${extension}`);
    try {
        await writeFile(imagePath, bytes, { mode: 0o600 });
        let upload;
        try { upload = await execCommand(command, ['upload-temp-url', imagePath], { timeout: 30000, maxBuffer: 1024 * 1024 }); }
        catch { throw new Error('TEMP_UPLOAD_FAILED'); }
        let uploaded;
        try { uploaded = JSON.parse(upload.stdout); } catch { throw new Error('TEMP_UPLOAD_FAILED'); }
        if (typeof uploaded.temp_url !== 'string' || !uploaded.temp_url.startsWith('https://')) throw new Error('TEMP_UPLOAD_FAILED');
        const args = JSON.stringify({ image_info: [{ url: uploaded.temp_url, prompt }] });
        let call;
        try { call = await execCommand(command, ['connector', 'call', 'connector__matrix__describe_images', '--args', args],
            { timeout: connectorTimeoutMs, maxBuffer: 1024 * 1024 }); }
        catch { throw new Error('VISION_UPSTREAM_FAILED'); }
        let response;
        try { response = JSON.parse(call.stdout); } catch { throw new Error('VISION_BAD_RESPONSE'); }
        if (response.code !== 0 || response.results?.[0]?.success !== true) throw new Error('VISION_UPSTREAM_FAILED');
        return parse(response.results[0].description);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

export async function recognizeImage(url, options = {}) { return describeImage(url, PROMPT, parseVisionDescription, options); }
export async function recognizeListingImage(url, options = {}) {
    return describeImage(url, LISTING_PROMPT, parseListingVisionDescription, { connectorTimeoutMs: 150000, ...options });
}
export async function recognizeExternalCandidateImage(url, imageHost, options = {}) {
    if (!validExternalImageUrl(url, imageHost)) throw new Error('IMAGE_HOST_UNSAFE');
    return describeImage(url, EXTERNAL_CANDIDATE_PROMPT, parseListingVisionDescription,
        { connectorTimeoutMs: 150000, imageTimeoutMs: 45000, ...options, authToken: undefined,
            fetchImpl: (target, init) => pinnedExternalFetch(target, { imageHost, signal: init.signal }) });
}

const SAFE_VISION_ERRORS = new Set(['IMAGE_FETCH_FAILED', 'IMAGE_HOST_UNSAFE', 'IMAGE_FORMAT_UNSUPPORTED', 'IMAGE_TOO_LARGE',
    'TEMP_UPLOAD_FAILED', 'VISION_UPSTREAM_FAILED', 'VISION_BAD_RESPONSE', 'VISION_UNCERTAIN', 'VISION_PRIVATE_CONTACT']);
export function safeVisionError(error) {
    return SAFE_VISION_ERRORS.has(error?.message) ? error.message : 'VISION_UNAVAILABLE';
}

function authorized(value, token) {
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
    const provided = Buffer.from(value.slice(7)), expected = Buffer.from(token);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readRequest(req) {
    if (Number(req.headers['content-length'] || 0) > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('REQUEST_INVALID'); }
}

function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
}

export function createBridge({ token, imageHost = DEFAULT_IMAGE_HOST, recognize = recognizeImage } = {}) {
    if (typeof token !== 'string' || token.length < 24) throw new Error('A local bridge token of at least 24 characters is required');
    const jobs = new Map();
    const waiting = [];
    let running = false;
    async function pump() {
        if (running) return;
        running = true;
        while (waiting.length) {
            const job = waiting.shift();
            job.status = 'PROCESSING';
            try { job.result = await recognize(job.imageUrl); job.status = 'COMPLETED'; }
            catch (error) { job.error = safeVisionError(error); job.status = 'FAILED'; }
            job.updatedAt = Date.now();
        }
        running = false;
    }
    const server = http.createServer(async (req, res) => {
        if (!authorized(req.headers.authorization, token)) return send(res, 401, { error: 'UNAUTHORIZED' });
        for (const [key, job] of jobs) if (Date.now() - job.updatedAt > JOB_TTL_MS) jobs.delete(key);
        if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ready: true, queued: waiting.length, running });
        if (req.method === 'GET' && /^\/jobs\/[A-Za-z0-9_-]{1,64}$/.test(req.url || '')) {
            const job = jobs.get(req.url.slice(6));
            return job ? send(res, 200, { jobId: job.jobId, status: job.status, result: job.result, error: job.error }) : send(res, 404, { error: 'NOT_FOUND' });
        }
        if (req.method !== 'POST' || req.url !== '/jobs') return send(res, 404, { error: 'NOT_FOUND' });
        if (typeof req.headers['content-type'] !== 'string' || !req.headers['content-type'].startsWith('application/json')) return send(res, 415, { error: 'JSON_REQUIRED' });
        try {
            const body = await readRequest(req);
            if (typeof body.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.jobId) || !validImageUrl(body.imageUrl, imageHost)) {
                return send(res, 400, { error: 'INVALID_JOB' });
            }
            const old = jobs.get(body.jobId);
            if (old) return old.imageUrl === body.imageUrl ? send(res, 202, { jobId: old.jobId, status: old.status }) : send(res, 409, { error: 'JOB_ID_CONFLICT' });
            if (waiting.length >= 5) return send(res, 429, { error: 'QUEUE_FULL' });
            const job = { jobId: body.jobId, imageUrl: body.imageUrl, status: 'PENDING', result: null, error: null, updatedAt: Date.now() };
            jobs.set(body.jobId, job);
            waiting.push(job);
            setImmediate(() => void pump());
            return send(res, 202, { jobId: job.jobId, status: job.status });
        } catch (error) {
            return send(res, error?.message === 'REQUEST_TOO_LARGE' ? 413 : 400, { error: error?.message === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'REQUEST_INVALID' });
        }
    });
    return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const token = process.env.WISHLIST_MINIMAX_BRIDGE_TOKEN;
    const port = Number(process.env.WISHLIST_MINIMAX_BRIDGE_PORT || '3777');
    createBridge({ token }).listen(port, '127.0.0.1', () => {
        process.stdout.write(`MiniMax vision pilot listening on 127.0.0.1:${port}\n`);
    });
}
