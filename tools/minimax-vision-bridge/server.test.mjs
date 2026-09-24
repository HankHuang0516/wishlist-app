import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createBridge, parseListingVisionDescription, parseVisionDescription, recognizeListingImage, safeVisionError, validImageUrl } from './server.mjs';

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

test('listing AI creates only a private seller suggestion with conservative pricing', () => {
    const result = parseListingVisionDescription(JSON.stringify({ recognizable: true, name: '黑色小型相機',
        description: '可見黑色機身、鏡頭與背面螢幕，功能和型號需要賣家確認。', category: 'electronics',
        brand: null, condition: null, estimatedPriceLowTwd: 800, estimatedPriceHighTwd: 2000,
        evidence: ['可見鏡頭', '可見螢幕'], uncertainties: ['功能未驗證'], confidence: 0.86 }));
    assert.equal(result.estimatedPriceLowTwd, 800);
    assert.match(result.priceBasis, /未查詢即時市場成交價/);
    const uncertain = parseListingVisionDescription(JSON.stringify({ ...result, confidence: 0.75 }));
    assert.equal(uncertain.estimatedPriceLowTwd, null);
    assert.deepEqual(parseListingVisionDescription(JSON.stringify({ ...result,
        uncertainties: '照片無法確認杯底品牌' })).uncertainties, ['照片無法確認杯底品牌']);
    assert.throws(() => parseListingVisionDescription('{"recognizable":false}'), /VISION_UNCERTAIN/);
});

test('connector failures cannot expose a signed temporary image URL or prompt in errors', async () => {
    const signed = 'https://temporary.example.invalid/image?signature=secret-value';
    const fakeImage = () => new Response(Buffer.from('89504e470d0a1a0a', 'hex'), { headers: { 'content-type': 'image/png' } });
    await assert.rejects(recognizeListingImage('https://fixture.invalid/image', { fetchImpl: fakeImage,
        execCommand: async (_command, args) => args[0] === 'upload-temp-url'
            ? { stdout: JSON.stringify({ temp_url: signed }) }
            : Promise.reject(new Error(`Command failed: ${signed} private prompt`)),
    }), error => error.message === 'VISION_UPSTREAM_FAILED' && !error.message.includes(signed));
    await assert.rejects(recognizeListingImage('https://fixture.invalid/image', { fetchImpl: fakeImage,
        execCommand: async () => { throw new Error('Command failed: private file path'); },
    }), error => error.message === 'TEMP_UPLOAD_FAILED' && !error.message.includes('private'));
    await assert.rejects(recognizeListingImage('https://fixture.invalid/image', {
        fetchImpl: async () => { throw new Error('Authorization: Bearer private-token'); },
    }), error => error.message === 'IMAGE_FETCH_FAILED' && !error.message.includes('private-token'));
    const brokenBody = new ReadableStream({ start(controller) { controller.error(new Error('private signed stream URL')); } });
    await assert.rejects(recognizeListingImage('https://fixture.invalid/image', {
        fetchImpl: async () => new Response(brokenBody, { headers: { 'content-type': 'image/png' } }),
    }), error => error.message === 'IMAGE_FETCH_FAILED' && !error.message.includes('private'));
    assert.equal(safeVisionError(new Error('private signed image URL')), 'VISION_UNAVAILABLE');
    assert.equal(safeVisionError(new Error('VISION_UPSTREAM_FAILED')), 'VISION_UPSTREAM_FAILED');
});

test('listing pilot sends a concise private-draft prompt with a bounded connector timeout', async () => {
    let connectorArgs, connectorTimeout;
    const result = await recognizeListingImage('https://fixture.invalid/image', {
        fetchImpl: async () => new Response(Buffer.from('89504e470d0a1a0a', 'hex'), { headers: { 'content-type': 'image/png' } }),
        execCommand: async (_command, args, options) => {
            if (args[0] === 'upload-temp-url') return { stdout: JSON.stringify({ temp_url: 'https://fixture.invalid/temporary' }) };
            connectorArgs = JSON.parse(args.at(-1)); connectorTimeout = options.timeout;
            return { stdout: JSON.stringify({ code: 0, results: [{ success: true, description: JSON.stringify({
                recognizable: true, name: '橘色檯燈', description: '可見橘色燈罩、底座與刮痕，功能須賣家確認。',
                category: 'home', evidence: ['橘色燈罩', '底座刮痕'], uncertainties: ['是否通電'], confidence: 0.9,
            }) }] }) };
        },
    });
    assert.equal(result.name, '橘色檯燈');
    assert.equal(connectorTimeout, 150000);
    assert.equal(connectorArgs.image_info.length, 1);
    assert.ok(connectorArgs.image_info[0].prompt.length < 450);
    assert.match(connectorArgs.image_info[0].prompt, /私人聯絡資訊/);
    assert.match(connectorArgs.image_info[0].prompt, /估價依據/);
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

test('loopback bridge never returns an unrecognized uppercase upstream secret', async () => {
    const server = createBridge({ token, recognize: async () => { throw new Error('PRIVATE_TOKEN'); } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    try {
        await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify({ jobId: 'wish-secret', imageUrl }) });
        let result;
        for (let attempt = 0; attempt < 20; attempt++) {
            result = await (await fetch(`${base}/jobs/wish-secret`, { headers })).json();
            if (result.status === 'FAILED') break;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.equal(result?.error, 'VISION_UNAVAILABLE');
    } finally { server.close(); }
});
