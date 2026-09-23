import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const token = process.env.VISION_GATEWAY_TOKEN?.trim();
if (!token || token.length < 24) throw new Error('VISION_GATEWAY_TOKEN must contain at least 24 characters');
const model = process.env.VISION_GATEWAY_MODEL?.trim() || 'qwen3-vl:2b-instruct';
const backend = new URL(process.env.OLLAMA_BACKEND_URL || 'http://ollama:11434');
if (backend.protocol !== 'http:' || backend.pathname !== '/' || backend.username || backend.password || backend.search || backend.hash) {
    throw new Error('OLLAMA_BACKEND_URL must be a private HTTP origin');
}
const maxBodyBytes = 12 * 1024 * 1024;

function send(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
}

function authorized(header) {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(header.slice(7));
    const expected = Buffer.from(token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readBody(req) {
    const length = Number(req.headers['content-length'] || 0);
    if (length > maxBodyBytes) throw new Error('BODY_TOO_LARGE');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBodyBytes) throw new Error('BODY_TOO_LARGE');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        try {
            const response = await fetch(new URL('/api/tags', backend), { signal: AbortSignal.timeout(3000) });
            const data = await response.json();
            const ready = response.ok && Array.isArray(data.models) && data.models.some(item => item.name === model);
            return send(res, ready ? 200 : 503, { ready, model });
        } catch { return send(res, 503, { ready: false, model }); }
    }
    if (req.method !== 'POST' || req.url !== '/api/chat') return send(res, 404, { error: 'NOT_FOUND' });
    if (!authorized(req.headers.authorization)) return send(res, 401, { error: 'UNAUTHORIZED' });
    if (typeof req.headers['content-type'] !== 'string' || !req.headers['content-type'].startsWith('application/json')) {
        return send(res, 415, { error: 'JSON_REQUIRED' });
    }
    try {
        const body = await readBody(req);
        const payload = JSON.parse(body.toString('utf8'));
        const messages = payload?.messages;
        if (payload?.model !== model || payload?.stream !== false || !Array.isArray(messages) || messages.length !== 1 ||
            messages[0]?.role !== 'user' || typeof messages[0]?.content !== 'string' || messages[0].content.length > 4000 ||
            !Array.isArray(messages[0]?.images) || messages[0].images.length !== 1 ||
            typeof messages[0].images[0] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(messages[0].images[0])) {
            return send(res, 400, { error: 'INVALID_REQUEST' });
        }
        const upstream = await fetch(new URL('/api/chat', backend), {
            method: 'POST', headers: { 'content-type': 'application/json' }, body,
            signal: AbortSignal.timeout(120000),
        });
        if (!upstream.ok) return send(res, 502, { error: 'MODEL_UNAVAILABLE' });
        const result = await upstream.text();
        if (result.length > 1_000_000) return send(res, 502, { error: 'MODEL_RESPONSE_TOO_LARGE' });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(result);
    } catch (error) {
        return send(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 502,
            { error: error?.message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'MODEL_UNAVAILABLE' });
    }
});

const port = Number(process.env.PORT || '3000');
server.listen(port, '0.0.0.0');
