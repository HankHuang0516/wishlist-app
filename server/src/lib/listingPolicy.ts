// Pilot marketplace restrictions, not a legal classifier or a substitute for
// reports/manual review. Keep this shared across create/edit/publish.
export const LISTING_POLICY_VERSION = '2026-09-15-pilot-v1';
const RESTRICTED_TERMS = ['槍枝', '槍支', '槍械', '彈藥', '毒品', '大麻', '海洛因', '安非他命', '個人資料販售', '色情服務',
    'firearm', 'ammunition', 'heroin', 'cannabis'] as const;

function normalized(value: string): string {
    // NFKD covers full-width Latin text and decomposes combining marks. Remove
    // presentation-only characters
    // and spacing that must not make the same restricted phrase admissible.
    return value.normalize('NFKD').toLowerCase().replace(/[\p{Cf}\p{M}\s]/gu, '');
}

export function forbiddenListingField(input: { title: string; description?: string | null; brand?: string | null }): 'title' | 'description' | 'brand' | null {
    for (const field of ['title', 'description', 'brand'] as const) {
        const value = input[field];
        if (typeof value === 'string') {
            const candidate = normalized(value);
            if (RESTRICTED_TERMS.some(term => candidate.includes(term))) return field;
        }
    }
    return null;
}

export function privateContactField(input: { title: string; description?: string | null; brand?: string | null }): 'title' | 'description' | 'brand' | null {
    for (const field of ['title', 'description', 'brand'] as const) {
        const value = input[field];
        if (typeof value !== 'string') continue;
        if (/(?:^|\D)09\d{8}(?:\D|$)/.test(value) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
            /\bLINE\s*(?:ID|帳號)\s*[:：]?\s*[A-Z0-9._-]{3,}/i.test(value)) return field;
    }
    return null;
}
