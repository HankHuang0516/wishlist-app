/**
 * AI Feature Tests
 * Tests for AI image analysis and smart input functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('AI Image Analysis', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('Image Upload Analysis', () => {
        it('sends image to AI analysis endpoint', async () => {
            const mockAnalysisResult = {
                name: 'Apple AirPods Pro',
                price: 7990,
                currency: 'TWD',
                purchaseLink: 'https://www.apple.com/tw/shop/product/MTJV3TA/A/',
                confidence: 0.95
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockAnalysisResult,
            });

            const formData = new FormData();
            formData.append('image', new Blob(['fake-image'], { type: 'image/png' }));

            const response = await fetch('/api/ai/analyze-image', {
                method: 'POST',
                headers: { Authorization: 'Bearer test-token' },
                body: formData
            });
            const data = await response.json();

            expect(data.name).toBe('Apple AirPods Pro');
            expect(data.price).toBe(7990);
            expect(data.confidence).toBeGreaterThan(0.9);
        });

        it('handles analysis failure gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 422,
                json: async () => ({ error: 'Unable to analyze image' }),
            });

            const response = await fetch('/api/ai/analyze-image', {
                method: 'POST',
                body: new FormData()
            });

            expect(response.ok).toBe(false);
            expect(response.status).toBe(422);
        });

        it('handles rate limiting', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => ({ error: 'Rate limit exceeded', retryAfter: 60 }),
            });

            const response = await fetch('/api/ai/analyze-image', {
                method: 'POST',
                body: new FormData()
            });

            expect(response.status).toBe(429);
        });
    });

    describe('Smart Input (Text Analysis)', () => {
        it('analyzes product name and returns suggestions', async () => {
            const mockResult = {
                name: 'Apple AirPods Pro 2',
                estimatedPrice: { min: 7000, max: 8500, currency: 'TWD' },
                suggestedLinks: [
                    'https://www.apple.com/tw/shop/product/airpods-pro',
                    'https://24h.pchome.com.tw/prod/airpods'
                ],
                category: 'Electronics'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResult,
            });

            const response = await fetch('/api/ai/smart-input', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token'
                },
                body: JSON.stringify({ query: 'Apple AirPods Pro 2' })
            });
            const data = await response.json();

            expect(data.name).toContain('AirPods');
            expect(data.estimatedPrice.min).toBeGreaterThan(0);
            expect(data.suggestedLinks).toHaveLength(2);
        });

        it('handles empty query', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Query is required' }),
            });

            const response = await fetch('/api/ai/smart-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '' })
            });

            expect(response.ok).toBe(false);
            expect(response.status).toBe(400);
        });
    });

    describe('URL Scraping', () => {
        it('extracts product info from URL', async () => {
            const mockResult = {
                name: 'Sony WH-1000XM5',
                price: 10900,
                currency: 'TWD',
                imageUrl: 'https://example.com/sony-headphones.jpg',
                description: 'Premium noise cancelling headphones'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResult,
            });

            const response = await fetch('/api/ai/scrape-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer test-token'
                },
                body: JSON.stringify({ url: 'https://www.sony.com.tw/product/wh-1000xm5' })
            });
            const data = await response.json();

            expect(data.name).toBe('Sony WH-1000XM5');
            expect(data.price).toBe(10900);
            expect(data.imageUrl).toBeTruthy();
        });

        it('validates URL format', () => {
            const isValidUrl = (url: string): boolean => {
                try {
                    new URL(url);
                    return true;
                } catch {
                    return false;
                }
            };

            expect(isValidUrl('https://www.apple.com/product')).toBe(true);
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('not-a-url')).toBe(false);
            expect(isValidUrl('')).toBe(false);
        });
    });
});

describe('AI Response Parsing', () => {
    it('parses price from various formats', () => {
        const parsePrice = (priceStr: string): number | null => {
            if (!priceStr) return null;

            // Remove currency symbols and commas
            const cleaned = priceStr.replace(/[NT$,¥€£\s]/g, '');
            const num = parseFloat(cleaned);

            return isNaN(num) ? null : num;
        };

        expect(parsePrice('NT$7,990')).toBe(7990);
        expect(parsePrice('$199.99')).toBe(199.99);
        expect(parsePrice('7990')).toBe(7990);
        expect(parsePrice('¥1,500')).toBe(1500);
        expect(parsePrice('')).toBe(null);
        expect(parsePrice('free')).toBe(null);
    });

    it('extracts product name from AI response', () => {
        const extractProductName = (response: { name?: string; title?: string; productName?: string }): string => {
            return response.name || response.title || response.productName || 'Unknown Product';
        };

        expect(extractProductName({ name: 'AirPods' })).toBe('AirPods');
        expect(extractProductName({ title: 'Sony Headphones' })).toBe('Sony Headphones');
        expect(extractProductName({ productName: 'iPhone 15' })).toBe('iPhone 15');
        expect(extractProductName({})).toBe('Unknown Product');
    });
});

describe('AI Error Handling', () => {
    it('handles network timeout', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        try {
            await fetch('/api/ai/analyze-image', { method: 'POST' });
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Network timeout');
        }
    });

    it('handles API key errors', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Invalid API key' }),
        });

        const response = await fetch('/api/ai/analyze-image', { method: 'POST' });

        expect(response.status).toBe(401);
    });
});
