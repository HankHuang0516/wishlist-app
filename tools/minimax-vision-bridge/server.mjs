import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4096;
const JOB_TTL_MS = 60 * 60 * 1000;
const DEFAULT_IMAGE_HOST = 'wishlist-app-production.up.railway.app';

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

async function boundedImage(url, fetchImpl) {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || !response.body) throw new Error('IMAGE_FETCH_FAILED');
    const mime = response.headers.get('content-type')?.split(';')[0].toLowerCase();
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    if (!extension) throw new Error('IMAGE_FORMAT_UNSUPPORTED');
    if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
        chunks.push(chunk);
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

export async function recognizeImage(url, { fetchImpl = fetch, command = 'mcode-tools' } = {}) {
    const { bytes, extension } = await boundedImage(url, fetchImpl);
    const directory = await mkdtemp(join(tmpdir(), 'wishlist-minimax-vision-'));
    const imagePath = join(directory, `image.${extension}`);
    try {
        await writeFile(imagePath, bytes, { mode: 0o600 });
        const upload = await execFileAsync(command, ['upload-temp-url', imagePath], { timeout: 30000, maxBuffer: 1024 * 1024 });
        let uploaded;
        try { uploaded = JSON.parse(upload.stdout); } catch { throw new Error('TEMP_UPLOAD_FAILED'); }
        if (typeof uploaded.temp_url !== 'string' || !uploaded.temp_url.startsWith('https://')) throw new Error('TEMP_UPLOAD_FAILED');
        const args = JSON.stringify({ image_info: [{ url: uploaded.temp_url, prompt: PROMPT }] });
        const call = await execFileAsync(command, ['connector', 'call', 'connector__matrix__describe_images', '--args', args],
            { timeout: 90000, maxBuffer: 1024 * 1024 });
        let response;
        try { response = JSON.parse(call.stdout); } catch { throw new Error('VISION_BAD_RESPONSE'); }
        if (response.code !== 0 || response.results?.[0]?.success !== true) throw new Error('VISION_UPSTREAM_FAILED');
        return parseVisionDescription(response.results[0].description);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
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
            catch (error) { job.error = /^([A-Z_]+)$/.test(error?.message || '') ? error.message : 'VISION_UNAVAILABLE'; job.status = 'FAILED'; }
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
