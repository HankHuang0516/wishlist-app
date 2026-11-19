// Pilot marketplace restrictions, not a legal classifier or a substitute for
// reports/manual review. Keep this shared across create/edit/publish.
export const LISTING_POLICY_VERSION = '2026-09-15-pilot-v1';
const RESTRICTED_PHRASES = ['槍枝', '槍支', '槍械', '彈藥', '毒品', '大麻', '海洛因', '安非他命', '個人資料販售', '色情服務'] as const;
const RESTRICTED_WORDS = ['firearm', 'ammunition', 'heroin', 'cannabis'] as const;
// A Latin term is restricted as a word of its own. Its letters may be spaced out
// ("h e r o i n", "fire arm") and it may take a plural s, exactly as before; what
// no longer counts is a longer word that merely contains the letters, such as the
// card set "Heroines Edition" or "superhero inside".
const RESTRICTED_WORD_PATTERNS = RESTRICTED_WORDS.map(word =>
    new RegExp('(?<![a-z])' + word.split('').join('\\s*') + '(?:\\s*s)?(?![a-z])'));

function readable(value: string): string {
    // NFKD covers full-width Latin text and decomposes combining marks. Remove
    // presentation-only characters that must not make the same restricted phrase admissible.
    return value.normalize('NFKD').toLowerCase().replace(/[\p{Cf}\p{M}]/gu, '');
}

export function forbiddenListingField(input: { title: string; description?: string | null; brand?: string | null }): 'title' | 'description' | 'brand' | null {
    for (const field of ['title', 'description', 'brand'] as const) {
        const value = input[field];
        if (typeof value === 'string') {
            const text = readable(value), unspaced = text.replace(/\s/g, '');
            if (RESTRICTED_PHRASES.some(phrase => unspaced.includes(phrase)) ||
                RESTRICTED_WORD_PATTERNS.some(pattern => pattern.test(text))) return field;
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
