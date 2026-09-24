import { isListingId, LISTING_CATEGORIES } from './listingRules';

export class ListingSellerDraftError extends Error {
    constructor() { super('私人商品草稿格式不正確'); }
}

const fields = ['title', 'description', 'brand', 'category', 'condition', 'price'] as const;
const touchedFields = new Set(fields);
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ListingSellerDraftError();
    return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
    if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new ListingSellerDraftError();
};
const text = (value: unknown, max: number) => {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ListingSellerDraftError();
    return value;
};

// Drafts need not yet be publishable. They contain no exact position, contact
// channel, public consent, or payment information; account erasure cascades.
export function parseListingSellerDraft(input: unknown) {
    const draft = object(input);
    exact(draft, ['clientListingId', 'form', 'touched']);
    if (!isListingId(draft.clientListingId)) throw new ListingSellerDraftError();
    const form = object(draft.form);
    exact(form, fields);
    const title = text(form.title, 100), description = text(form.description, 3000), brand = text(form.brand, 60);
    const price = text(form.price, 13);
    if (!LISTING_CATEGORIES.includes(form.category as typeof LISTING_CATEGORIES[number]) ||
        !['NEW', 'USED'].includes(String(form.condition)) ||
        (price !== '' && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(price) || Number(price) > 9_999_999_999.99))) throw new ListingSellerDraftError();
    const touched = object(draft.touched);
    if (Object.entries(touched).some(([key, value]) => !touchedFields.has(key as typeof fields[number]) || value !== true)) throw new ListingSellerDraftError();
    const normalizedTouched = Object.fromEntries(Object.keys(touched).map(key => [key, true])) as Partial<Record<typeof fields[number], true>>;
    return { clientListingId: draft.clientListingId as string,
        form: { title, description, brand, category: form.category as typeof LISTING_CATEGORIES[number],
            condition: form.condition as 'NEW' | 'USED', price }, touched: normalizedTouched };
}
