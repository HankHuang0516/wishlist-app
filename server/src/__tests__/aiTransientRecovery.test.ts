const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: () => ({ generateContent: (...args: unknown[]) => mockGenerateContent(...args) }),
    })),
}));
jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));

import { analyzeLocalImage } from '../controllers/aiController';

describe('actual image inference controller transient recovery', () => {
    let originalKey: string | undefined;
    beforeEach(() => {
        originalKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-only-mocked-provider';
        jest.useFakeTimers();
        mockGenerateContent.mockReset();
    });
    afterEach(() => {
        if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalKey;
        jest.useRealTimers();
    });

    it('retries the actual SDK call and parses only the successful provider response', async () => {
        mockGenerateContent.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({
            response: { text: () => JSON.stringify({ name: '二手相機', currency: 'TWD', price: 2500 }) },
        });
        const pending = analyzeLocalImage({ buffer: Buffer.from('mock-image'), mimetype: 'image/jpeg', originalname: 'test.jpg' });
        await jest.runAllTimersAsync();
        await expect(pending).resolves.toMatchObject({ name: '二手相機', price: 2500 });
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
        expect(mockGenerateContent.mock.calls[0][1]).toEqual({ timeout: 20000 });
    });

    it('does not retry authentication errors or fabricate successful product data', async () => {
        const error = Object.assign(new Error('invalid credential'), { status: 403 });
        mockGenerateContent.mockRejectedValue(error);
        await expect(analyzeLocalImage({ buffer: Buffer.from('mock-image'), mimetype: 'image/jpeg', originalname: 'test.jpg' }))
            .rejects.toBe(error);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
});
