import { validMinimaxResult } from '../routes/minimaxRecognitionRoutes';

describe('MiniMax result validation', () => {
    const result = { name: '白糖粿招牌', category: '招牌', visibleText: ['白糖粿 40元'], listedPriceTwd: 40,
        evidence: ['可見白糖粿文字', '可見40元標價'], uncertainties: [], confidence: 0.86 };
    it('accepts grounded visible prices and bounds text', () => {
        expect(validMinimaxResult(result)).toMatchObject({ name: '白糖粿招牌', price: '40', currency: 'TWD', notes: expect.stringContaining('可見依據') });
    });
    it('does not invent prices absent from pixels', () => {
        expect(validMinimaxResult({ ...result, visibleText: [], listedPriceTwd: 4000 })).toMatchObject({ price: null, currency: null });
    });
    it('rejects unsupported low-confidence output', () => {
        expect(validMinimaxResult({ ...result, confidence: 0.3 })).toBeNull();
        expect(validMinimaxResult({ ...result, evidence: [] })).toBeNull();
    });
});
