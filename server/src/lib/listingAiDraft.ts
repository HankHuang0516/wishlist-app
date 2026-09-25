import { LISTING_CATEGORIES } from './listingRules';
import { privateContactField } from './listingPolicy';

export type ListingAiDraft = {
    title: string;
    description: string;
    category: typeof LISTING_CATEGORIES[number];
    brand: string | null;
    condition: 'USED' | 'NEW' | null;
    estimatedPriceLowTwd: number | null;
    estimatedPriceHighTwd: number | null;
    priceBasis: string | null;
    evidence: string[];
    uncertainties: string[];
    confidence: number;
    source: 'MINIMAX_CODE_VISION';
};

const clean = (value: unknown, max: number) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const lines = (value: unknown, maxItems: number, maxChars: number) => Array.isArray(value)
    ? value.map(item => clean(item, maxChars)).filter(Boolean).slice(0, maxItems) : [];
const amount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;

// The model provides suggestions, not seller assertions. Empty/uncertain fields
// stay empty; a suggestion may be saved privately but never publishes itself.
export function validListingAiDraft(raw: unknown): ListingAiDraft | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const title = clean(value.name, 100), description = clean(value.description, 1500);
    const evidence = lines(value.evidence, 6, 160), uncertainties = lines(value.uncertainties, 6, 160);
    const confidence = Number(value.confidence);
    if (value.recognizable !== true || title.length < 3 || description.length < 16 || evidence.length < 2 ||
        !Number.isFinite(confidence) || confidence < 0.7 || confidence > 1) return null;
    const category = LISTING_CATEGORIES.includes(value.category as typeof LISTING_CATEGORIES[number])
        ? value.category as typeof LISTING_CATEGORIES[number] : 'other';
    const brand = clean(value.brand, 60) || null;
    if (privateContactField({ title, description, brand })) return null;
    const condition = value.condition === 'NEW' || value.condition === 'USED' ? value.condition : null;
    const low = amount(value.estimatedPriceLowTwd), high = amount(value.estimatedPriceHighTwd);
    const priceBasis = clean(value.priceBasis, 240) || null;
    const priceValid = low !== null && high !== null && high >= low && high <= Math.max(100, low * 10) && !!priceBasis;
    return { title, description, category, brand, condition,
        estimatedPriceLowTwd: priceValid ? low : null, estimatedPriceHighTwd: priceValid ? high : null,
        priceBasis: priceValid ? priceBasis : null, evidence, uncertainties, confidence,
        source: 'MINIMAX_CODE_VISION' };
}
