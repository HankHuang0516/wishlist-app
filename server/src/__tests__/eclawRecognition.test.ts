import { EclawRecognitionError, isLikelyImageResourceUrl, parseRecognitionReply, recognizeWithEclaw, safePublicResourceUrl, type EclawRecognitionConfig } from '../lib/eclawRecognition';

const config: EclawRecognitionConfig = {
    baseUrl: 'https://eclaw.example', deviceId: 'device-1', deviceSecret: 'secret-1', entityId: 0,
    pollIntervalMs: 250, replyTimeoutMs: 5000,
};

function response(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('EClaw queued product recognition contract', () => {
    it('dispatches the public image as photo media and accepts the matching JSON reply', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response({ messages: [{ id: 'old', entity_id: 0, is_from_bot: true, text: 'old' }] }))
            .mockResolvedValueOnce(response({ success: true }))
            .mockResolvedValueOnce(response({ messages: [
                { id: 'old', entity_id: 0, is_from_bot: true, text: 'old' },
                { id: 'new', entity_id: 0, is_from_bot: true, created_at: new Date().toISOString(), text: '```json\n{"jobId":"wish-7","name":"Sony WH-1000XM5","brand":"Sony","model":"WH-1000XM5","category":"耳機","condition":"外觀良好","price":6990,"priceLow":6500,"priceHigh":7500,"currency":"twd","priceBasis":"台灣近期市場售價","tags":["耳機","降噪"],"keyFeatures":["頭戴式","主動降噪"],"confidence":0.94,"uncertainties":["無法確認保固"],"shoppingLink":"https://example.com/search","description":"無線降噪耳機"}\n```' },
            ] }));

        await expect(recognizeWithEclaw({ jobId: 'wish-7', resourceUrl: 'https://images.example.com/item.jpg', currentName: '上傳圖片' }, config, fetchImpl))
            .resolves.toEqual({ name: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', category: '耳機', condition: '外觀良好', price: 6990, priceLow: 6500, priceHigh: 7500, currency: 'TWD', priceBasis: '台灣近期市場售價', tags: ['耳機', '降噪'], keyFeatures: ['頭戴式', '主動降噪'], confidence: 0.94, uncertainties: ['無法確認保固'], shoppingLink: 'https://example.com/search', description: '無線降噪耳機' });
        const dispatch = JSON.parse(fetchImpl.mock.calls[1][1].body);
        expect(dispatch).toMatchObject({ deviceId: 'device-1', entityId: 0, source: 'wishlist-ai', mediaType: 'photo', mediaUrl: 'https://images.example.com/item.jpg' });
        expect(dispatch.text).toContain('WISHLIST_AI_JOB:wish-7');
        expect(dispatch.text).toContain('priceLow');
        expect(dispatch.text).toContain('不可因相似外觀猜測品牌或型號');
        expect(fetchImpl.mock.calls[1][1].headers['idempotency-key']).toBe('wish-7');
    });

    it('rejects a reply for a different queued job instead of cross-wiring items', () => {
        expect(() => parseRecognitionReply('{"jobId":"wish-8","name":"錯誤商品"}', 'wish-7'))
            .toThrow(EclawRecognitionError);
    });

    it.each(['http://example.com/a.jpg', 'https://user:pass@example.com/a.jpg', 'file:///tmp/a.jpg', 'not-a-url'])
        ('refuses non-public resource URL %s', value => expect(() => safePublicResourceUrl(value)).toThrow(EclawRecognitionError));

    it('recognizes direct image URLs so the web card can retain its thumbnail', () => {
        expect(isLikelyImageResourceUrl('https://upload.wikimedia.org/wikipedia/commons/8/8b/Headphones.jpg')).toBe(true);
        expect(isLikelyImageResourceUrl('https://example.com/product/123')).toBe(false);
    });

    it('does not invent optional values when the agent returns null', () => {
        expect(parseRecognitionReply('{"jobId":"wish-1","name":"未知商品","price":null,"currency":null,"tags":[],"shoppingLink":null,"description":null}', 'wish-1'))
            .toEqual({ name: '未知商品', brand: null, model: null, category: null, condition: null, price: null, priceLow: null, priceHigh: null, currency: null, priceBasis: null, tags: [], keyFeatures: [], confidence: null, uncertainties: [], shoppingLink: null, description: null });
    });

    it('rejects contradictory price ranges and prices without currency', () => {
        expect(() => parseRecognitionReply('{"jobId":"wish-1","name":"商品","price":300,"priceLow":400,"priceHigh":500,"currency":"TWD"}', 'wish-1')).toThrow(EclawRecognitionError);
        expect(() => parseRecognitionReply('{"jobId":"wish-1","name":"商品","price":300,"priceLow":null,"priceHigh":null,"currency":null}', 'wish-1')).toThrow(EclawRecognitionError);
    });
});
