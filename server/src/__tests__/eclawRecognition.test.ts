import { EclawRecognitionError, isLikelyImageResourceUrl, parseRecognitionReply, recognizeWithEclaw, safePublicResourceUrl, type EclawRecognitionConfig } from '../lib/eclawRecognition';
import sharp from 'sharp';
import { loadOllamaVisionConfig, parseVisionEvidence, VisionError } from '../lib/ollamaVision';

const config: EclawRecognitionConfig = {
    baseUrl: 'https://eclaw.example', deviceId: 'device-1', deviceSecret: 'secret-1', entityId: 0,
    pollIntervalMs: 250, replyTimeoutMs: 5000,
    vision: { baseUrl: 'http://127.0.0.1:11434', token: null, model: 'qwen3-vl:2b-instruct', allowedImageHosts: ['images.example.com'] },
};

function response(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('EClaw queued product recognition contract', () => {
    it('runs understand_image on real image bytes before dispatch and grounds the saved identity', async () => {
        const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(new Response(image, { headers: { 'content-type': 'image/png' } }))
            .mockResolvedValueOnce(response({ done: true, message: { content: '{"recognizable":true,"name":"Sony WH-1000XM5","brand":"Sony","model":"WH-1000XM5","category":"耳機","condition":"外觀良好","evidence":["可見 Sony 標誌","可見型號標示 WH-1000XM5","頭戴式耳機"],"uncertainties":["無法確認保固"],"confidence":0.94}' } }))
            .mockResolvedValueOnce(response({ messages: [{ id: 'old', entity_id: 0, is_from_bot: true, text: 'old' }] }))
            .mockResolvedValueOnce(response({ success: true }))
            .mockResolvedValueOnce(response({ messages: [
                { id: 'old', entity_id: 0, is_from_bot: true, text: 'old' },
                { id: 'new', entity_id: 0, is_from_bot: true, created_at: new Date().toISOString(), text: '```json\n{"jobId":"wish-7","name":"Sony WH-1000XM5","brand":"Sony","model":"WH-1000XM5","category":"耳機","condition":"外觀良好","price":6990,"priceLow":6500,"priceHigh":7500,"currency":"twd","priceBasis":"台灣近期市場售價","tags":["耳機","降噪"],"keyFeatures":["頭戴式","主動降噪"],"confidence":0.94,"uncertainties":["無法確認保固"],"shoppingLink":"https://example.com/search","description":"無線降噪耳機"}\n```' },
            ] }));

        await expect(recognizeWithEclaw({ jobId: 'wish-7', resourceUrl: 'https://images.example.com/item.jpg', currentName: '上傳圖片' }, config, fetchImpl))
            .resolves.toEqual({ name: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', category: '耳機', condition: '外觀良好', price: 6990, priceLow: 6500, priceHigh: 7500, currency: 'TWD', priceBasis: '台灣近期市場售價', tags: ['耳機', '降噪'], keyFeatures: ['可見 Sony 標誌', '可見型號標示 WH-1000XM5', '頭戴式耳機'], confidence: 0.94, uncertainties: ['無法確認保固'], shoppingLink: 'https://example.com/search', description: '可見 Sony 標誌；可見型號標示 WH-1000XM5；頭戴式耳機' });
        const visionRequest = JSON.parse(fetchImpl.mock.calls[1][1].body);
        expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
        expect(visionRequest.model).toBe('qwen3-vl:2b-instruct');
        expect(visionRequest.messages[0].images[0]).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(visionRequest.messages[0].content).toContain('招牌');
        expect(visionRequest.format).toBe('json');
        const dispatch = JSON.parse(fetchImpl.mock.calls[3][1].body);
        expect(dispatch).toMatchObject({ deviceId: 'device-1', entityId: 0, source: 'wishlist-ai', mediaType: 'photo', mediaUrl: 'https://images.example.com/item.jpg' });
        expect(dispatch.text).toContain('WISHLIST_AI_JOB:wish-7');
        expect(dispatch.text).toContain('priceLow');
        expect(dispatch.text).toContain('品類估算');
        expect(dispatch.text).toContain('不得為 null');
        expect(dispatch.text).toContain('不可因相似外觀猜測品牌或型號');
        expect(dispatch.text).toContain('已完成 Qwen3-VL 圖片鑑識');
        expect(fetchImpl.mock.calls[3][1].headers['idempotency-key']).toBe('wish-7');
    });

    it('fails closed without vision configuration and never asks the text agent to guess', async () => {
        const fetchImpl = jest.fn();
        await expect(recognizeWithEclaw({ jobId: 'wish-8', resourceUrl: 'https://images.example.com/item.jpg', currentName: '上傳圖片' }, { ...config, vision: null }, fetchImpl))
            .rejects.toMatchObject({ code: 'VISION_NOT_CONFIGURED' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('rejects ungrounded vision output instead of accepting a plausible text estimate', () => {
        expect(() => parseVisionEvidence('{"recognizable":false,"name":"相機","evidence":[],"confidence":0.2}'))
            .toThrow(expect.objectContaining({ code: 'VISION_UNCERTAIN' }));
        expect(() => parseVisionEvidence('{"recognizable":true,"name":"相機","evidence":[],"confidence":0.9}'))
            .toThrow(VisionError);
    });

    it('drops unsupported brand and model claims while preserving visible subject evidence', () => {
        expect(parseVisionEvidence(JSON.stringify({ recognizable: true, name: '寶可夢公仔', brand: 'Apple', model: 'iMac', evidence: ['兩隻有翅膀的彩色公仔'], confidence: 0.8 })))
            .toMatchObject({ name: '寶可夢公仔', brand: null, model: null, uncertainties: expect.arrayContaining([expect.stringContaining('品牌缺少'), expect.stringContaining('型號缺少')]) });
    });

    it('refuses to download image bytes from a host outside the allowlist', async () => {
        const fetchImpl = jest.fn();
        await expect(recognizeWithEclaw({ jobId: 'wish-9', resourceUrl: 'https://other.example.com/item.jpg', currentName: '上傳圖片' }, config, fetchImpl))
            .rejects.toMatchObject({ code: 'VISION_UNSAFE_URL' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        ['寶可夢公仔', 'Apple iMac'],
        ['白糖粿招牌', 'Polaroid OneStep'],
    ])('blocks known category swap %s → %s before any database write', async (seen, guessed) => {
        const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(new Response(image, { headers: { 'content-type': 'image/png' } }))
            .mockResolvedValueOnce(response({ done: true, message: { content: JSON.stringify({ recognizable: true, name: seen, evidence: [`可見${seen}`], confidence: 0.9 }) } }))
            .mockResolvedValueOnce(response({ messages: [] }))
            .mockResolvedValueOnce(response({ success: true }))
            .mockResolvedValueOnce(response({ messages: [{ id: 'reply', entity_id: 0, is_from_bot: true, created_at: new Date().toISOString(), text: JSON.stringify({ jobId: 'wish-7', name: guessed, price: 1000, priceLow: 800, priceHigh: 1200, currency: 'TWD', priceBasis: '品類估算' }) }] }));
        await expect(recognizeWithEclaw({ jobId: 'wish-7', resourceUrl: 'https://images.example.com/item.jpg', currentName: '上傳圖片' }, config, fetchImpl))
            .rejects.toMatchObject({ code: 'VISION_CONFLICT' });
    });

    it('rejects a reply for a different queued job instead of cross-wiring items', () => {
        expect(() => parseRecognitionReply('{"jobId":"wish-8","name":"錯誤商品"}', 'wish-7'))
            .toThrow(EclawRecognitionError);
    });

    it('requires TLS and authentication for a remote model endpoint', () => {
        expect(() => loadOllamaVisionConfig({ OLLAMA_VISION_URL: 'http://gpu.example.com' } as NodeJS.ProcessEnv)).toThrow();
        expect(() => loadOllamaVisionConfig({ OLLAMA_VISION_URL: 'https://gpu.example.com' } as NodeJS.ProcessEnv)).toThrow();
        expect(loadOllamaVisionConfig({ OLLAMA_VISION_URL: 'https://gpu.example.com', OLLAMA_VISION_TOKEN: 'test-only' } as NodeJS.ProcessEnv))
            .toMatchObject({ baseUrl: 'https://gpu.example.com', token: 'test-only', model: 'qwen3-vl:2b-instruct' });
    });

    it.each(['http://example.com/a.jpg', 'https://user:pass@example.com/a.jpg', 'file:///tmp/a.jpg', 'not-a-url'])
        ('refuses non-public resource URL %s', value => expect(() => safePublicResourceUrl(value)).toThrow(EclawRecognitionError));

    it('recognizes direct image URLs so the web card can retain its thumbnail', () => {
        expect(isLikelyImageResourceUrl('https://upload.wikimedia.org/wikipedia/commons/8/8b/Headphones.jpg')).toBe(true);
        expect(isLikelyImageResourceUrl('https://wishlist-app-production.up.railway.app/api/listing-media/fab22941-2df0-4ca4-90c2-70c504527243/image')).toBe(true);
        expect(isLikelyImageResourceUrl('https://example.com/product/123')).toBe(false);
    });

    it('keeps identity fields optional while requiring a transparent best-effort estimate', () => {
        expect(parseRecognitionReply('{"jobId":"wish-1","name":"未知品牌耳機","price":1000,"priceLow":800,"priceHigh":1200,"currency":"TWD","priceBasis":"同類型頭戴耳機品類估算","tags":[],"shoppingLink":null,"description":null}', 'wish-1'))
            .toEqual({ name: '未知品牌耳機', brand: null, model: null, category: null, condition: null, price: 1000, priceLow: 800, priceHigh: 1200, currency: 'TWD', priceBasis: '同類型頭戴耳機品類估算', tags: [], keyFeatures: [], confidence: null, uncertainties: [], shoppingLink: null, description: null });
        expect(() => parseRecognitionReply('{"jobId":"wish-1","name":"未知商品","price":null,"currency":null}', 'wish-1'))
            .toThrow(expect.objectContaining({ code: 'INCOMPLETE_ESTIMATE' }));
    });

    it('rejects contradictory price ranges and prices without currency', () => {
        expect(() => parseRecognitionReply('{"jobId":"wish-1","name":"商品","price":300,"priceLow":400,"priceHigh":500,"currency":"TWD"}', 'wish-1')).toThrow(EclawRecognitionError);
        expect(() => parseRecognitionReply('{"jobId":"wish-1","name":"商品","price":300,"priceLow":null,"priceHigh":null,"currency":null}', 'wish-1')).toThrow(EclawRecognitionError);
    });
});
