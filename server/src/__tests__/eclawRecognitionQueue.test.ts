const findFirst = jest.fn();
const updateMany = jest.fn();
jest.mock('../lib/prisma', () => ({ __esModule: true, default: { item: { findFirst, updateMany } } }));
const quota = jest.fn();
jest.mock('../lib/usageService', () => ({ checkAndIncrementAiUsage: (...args: unknown[]) => quota(...args) }));

import { startEclawRecognitionWorker } from '../lib/eclawRecognitionQueue';
import { EclawRecognitionError } from '../lib/eclawRecognition';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('durable EClaw recognition queue', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        process.env.ECLAW_RECOGNITION_DEVICE_ID = 'test-device';
        process.env.ECLAW_RECOGNITION_DEVICE_SECRET = 'test-secret';
        findFirst.mockReset(); updateMany.mockReset(); quota.mockReset();
    });
    afterEach(() => {
        jest.clearAllTimers(); jest.useRealTimers();
        delete process.env.ECLAW_RECOGNITION_DEVICE_ID;
        delete process.env.ECLAW_RECOGNITION_DEVICE_SECRET;
    });

    it('claims one oldest pending item and writes the matching agent result', async () => {
        findFirst.mockResolvedValueOnce({ id: 7, name: 'Image Item', imageUrl: 'https://images.example/item.jpg', link: null, aiError: null, wishlist: { userId: 3 } }).mockResolvedValue(null);
        updateMany.mockResolvedValue({ count: 1 }); quota.mockResolvedValue(true);
        const recognize = jest.fn().mockResolvedValue({ name: '二手相機', brand: 'Sony', model: 'A7', category: '相機', condition: '外觀良好', price: 2500, priceLow: 2200, priceHigh: 2800, currency: 'TWD', priceBasis: '二手市場', tags: ['相機'], keyFeatures: ['可換鏡頭'], confidence: 0.9, uncertainties: ['快門數未知'], shoppingLink: null, description: '外觀良好' });
        const stop = startEclawRecognitionWorker(recognize, jest.fn());
        await settle();
        expect(recognize).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'wish-7', resourceUrl: 'https://images.example/item.jpg' }), expect.objectContaining({ deviceId: 'test-device' }));
        expect(updateMany.mock.calls[0][0]).toMatchObject({ where: { aiStatus: 'PROCESSING' }, data: { aiStatus: 'PENDING' } });
        expect(updateMany.mock.calls[1][0]).toMatchObject({ where: { id: 7, aiStatus: 'PENDING' }, data: { aiStatus: 'PROCESSING' } });
        expect(updateMany.mock.calls[2][0]).toMatchObject({ where: { id: 7, aiStatus: 'PROCESSING' }, data: { name: '二手相機', price: '2500', currency: 'TWD', notes: expect.stringContaining('參考價格區間：TWD 2200–2800'), aiStatus: 'COMPLETED' } });
        stop();
    });

    it('retries one incomplete estimate with a distinct job id without charging quota twice', async () => {
        const original = { id: 9, name: 'Headphones', imageUrl: 'https://images.example/item.jpg', link: null, aiError: null, wishlist: { userId: 3 } };
        const retry = { ...original, aiError: 'ECLAW_RETRY_1' };
        findFirst.mockResolvedValueOnce(original).mockResolvedValueOnce(retry).mockResolvedValue(null);
        updateMany.mockResolvedValue({ count: 1 }); quota.mockResolvedValue(true);
        const recognize = jest.fn()
            .mockRejectedValueOnce(new EclawRecognitionError('Missing estimate', 'INCOMPLETE_ESTIMATE'))
            .mockResolvedValueOnce({ name: '頭戴式耳機', brand: null, model: null, category: '耳機', condition: null, price: 1000, priceLow: 800, priceHigh: 1200, currency: 'TWD', priceBasis: '同類產品品類估算', tags: ['耳機'], keyFeatures: [], confidence: 0.7, uncertainties: ['型號未知'], shoppingLink: null, description: null });
        const report = jest.fn();
        const stop = startEclawRecognitionWorker(recognize, report);
        await settle();
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 9, aiStatus: 'PROCESSING' }, data: { aiStatus: 'PENDING', aiError: 'ECLAW_RETRY_1' },
        }));

        jest.advanceTimersByTime(3000);
        await settle();
        expect(recognize.mock.calls.map(call => call[0].jobId)).toEqual(['wish-9', 'wish-9-retry-1']);
        expect(quota).toHaveBeenCalledTimes(1);
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 9, aiStatus: 'PROCESSING' }, data: expect.objectContaining({ name: '頭戴式耳機', price: '1000', aiStatus: 'COMPLETED' }),
        }));
        stop();
    });

    it('leaves queued rows untouched when dedicated credentials are absent', () => {
        delete process.env.ECLAW_RECOGNITION_DEVICE_ID;
        delete process.env.ECLAW_RECOGNITION_DEVICE_SECRET;
        const report = jest.fn();
        const stop = startEclawRecognitionWorker(jest.fn(), report);
        expect(findFirst).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(expect.stringContaining('worker disabled'));
        stop();
    });

    it('preserves the user image and name when visual evidence conflicts with the agent', async () => {
        findFirst.mockResolvedValueOnce({ id: 805, name: '上傳圖片', imageUrl: 'https://images.example/item.jpg', link: null, aiError: null, wishlist: { userId: 3 } }).mockResolvedValue(null);
        updateMany.mockResolvedValue({ count: 1 }); quota.mockResolvedValue(true);
        const stop = startEclawRecognitionWorker(jest.fn().mockRejectedValue(new EclawRecognitionError('wrong subject', 'VISION_CONFLICT')), jest.fn());
        await settle();
        expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 805, aiStatus: 'PROCESSING' }, data: { aiStatus: 'FAILED', aiError: 'VISION_CONFLICT' },
        }));
        expect(updateMany.mock.calls.every(call => !Object.prototype.hasOwnProperty.call(call[0].data, 'name'))).toBe(true);
        stop();
    });
});
