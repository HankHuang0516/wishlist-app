import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBridge, parseVisionDescription, validImageUrl } from './server.mjs';

const imageUrl = 'https://wishlist-app-production.up.railway.app/api/listing-media/41fe5714-b31f-475d-b040-01e2a5c2e1cb/image';
const token = 'local-pilot-test-token-1234567890';

test('only a public approved wishlist image URL may be submitted', () => {
    assert.equal(validImageUrl(imageUrl), true);
    assert.equal(validImageUrl('http://127.0.0.1/private.jpg'), false);
    assert.equal(validImageUrl('https://wishlist-app-production.up.railway.app.evil.test/api/listing-media/41fe5714-b31f-475d-b040-01e2a5c2e1cb/image'), false);
    assert.equal(validImageUrl(`${imageUrl}?token=secret`), false);
});

test('accepts visual evidence but not unsupported price claims', () => {
    const result = parseVisionDescription(JSON.stringify({
        recognizable: true, name: '白糖粿招牌', category: '小吃招牌',
        visibleText: ['白糖粿', '每份2入40元'], listedPriceTwd: 40,
        evidence: ['藍色招牌', '有兩入食品照片'], confidence: 0.8,
    }));
    assert.equal(result.listedPriceTwd, 40);
    assert.equal(parseVisionDescription(JSON.stringify({
        recognizable: true, name: '白糖粿招牌', category: '商品廣告',
        visibleText: ['白糖粿', '每份2入', '40元'], listedPriceTwd: null,
        evidence: ['藍色招牌', '有印刷食品照片'], confidence: 0.8,
    })).listedPriceTwd, 40);
    assert.equal(parseVisionDescription(JSON.stringify({
        recognizable: true, name: '模型公仔', visibleText: [], listedPriceTwd: 10000,
        evidence: ['有雙翼', '彩色底座'], confidence: 0.8,
    })).listedPriceTwd, null);
    assert.throws(() => parseVisionDescription('{"recognizable":true,"name":"相機","evidence":[],"confidence":0.9}'), /VISION_UNCERTAIN/);
});

test('loopback bridge requires auth, deduplicates jobs, and processes one at a time', async () => {
    let active = 0, maximumActive = 0;
    const recognize = async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 30));
        active--;
        return { name: '白糖粿招牌' };
    };
    const server = createBridge({ token, recognize });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    try {
        assert.equal((await fetch(`${base}/health`)).status, 401);
        assert.equal((await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId: 'bad', imageUrl: 'http://127.0.0.1/photo' }) })).status, 400);
        for (const jobId of ['wish-1', 'wish-2']) {
            assert.equal((await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId, imageUrl }) })).status, 202);
        }
        assert.equal((await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId: 'wish-1', imageUrl }) })).status, 202);
        assert.equal((await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId: 'wish-1', imageUrl: imageUrl.replace('41fe5714', '51fe5714') }) })).status, 409);
        for (let attempt = 0; attempt < 30; attempt++) {
            const one = await (await fetch(`${base}/jobs/wish-1`, { headers })).json();
            const two = await (await fetch(`${base}/jobs/wish-2`, { headers })).json();
            if (one.status === 'COMPLETED' && two.status === 'COMPLETED') break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal((await (await fetch(`${base}/jobs/wish-2`, { headers })).json()).result.name, '白糖粿招牌');
        assert.equal(maximumActive, 1);
    } finally { server.close(); }
});

test('a failed MiniMax call stays failed and never becomes a fabricated result', async () => {
    const server = createBridge({ token, recognize: async () => { throw new Error('VISION_UPSTREAM_FAILED'); } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    try {
        await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId: 'wish-error', imageUrl }) });
        let result;
        for (let attempt = 0; attempt < 20; attempt++) {
            result = await (await fetch(`${base}/jobs/wish-error`, { headers })).json();
            if (result.status === 'FAILED') break;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.deepEqual({ status: result.status, result: result.result, error: result.error },
            { status: 'FAILED', result: null, error: 'VISION_UPSTREAM_FAILED' });
    } finally { server.close(); }
});
