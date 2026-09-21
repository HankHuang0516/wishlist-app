import { parseOptionalCurrency, parseOptionalPrice } from './matchmakingPrice';

export class WishItemUpdateError extends Error {
    constructor(public readonly status = 400) { super('Wish item update rejected'); }
}
export type WishItemPatch = {
    name?: string; price?: string | null; currency?: string; notes?: string | null;
    link?: string | null; isHidden?: boolean; isPurchased?: boolean;
    maxPrice?: number | null; priceCurrency?: string;
};
const keys = ['name', 'price', 'currency', 'notes', 'link', 'isHidden', 'isPurchased', 'maxPrice', 'priceCurrency'];
export function parseWishItemPatch(raw: unknown): WishItemPatch {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WishItemUpdateError();
    const body = raw as Record<string, unknown>, supplied = Object.keys(body);
    if (!supplied.length || supplied.some(k => !keys.includes(k))) throw new WishItemUpdateError();
    const patch: WishItemPatch = {};
    for (const k of ['isHidden', 'isPurchased'] as const) if (k in body) {
        if (typeof body[k] !== 'boolean') throw new WishItemUpdateError();
        patch[k] = body[k];
    }
    if ('name' in body) {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200 || /[\u0000-\u001f\u007f]/.test(body.name)) throw new WishItemUpdateError();
        patch.name = body.name.trim();
    }
    if ('notes' in body) {
        if (!(body.notes === null || (typeof body.notes === 'string' && body.notes.length <= 1000 && !body.notes.includes('\u0000')))) throw new WishItemUpdateError();
        patch.notes = body.notes as string | null;
    }
    if ('link' in body) {
        if (body.link === null || body.link === '') patch.link = null;
        else {
            if (typeof body.link !== 'string' || body.link.length > 2048) throw new WishItemUpdateError();
            let url: URL; try { url = new URL(body.link); } catch { throw new WishItemUpdateError(); }
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new WishItemUpdateError();
            patch.link = url.href;
        }
    }
    for (const k of ['price', 'maxPrice'] as const) if (k in body) {
        if (typeof body[k] === 'string' && !(body[k] as string).trim() && body[k] !== '') throw new WishItemUpdateError();
        const parsed = parseOptionalPrice(body[k]);
        if (!parsed.ok) throw new WishItemUpdateError();
        if (k === 'price') patch.price = parsed.value === null ? null : String(parsed.value);
        else patch.maxPrice = parsed.value;
    }
    for (const k of ['currency', 'priceCurrency'] as const) if (k in body) {
        if (typeof body[k] !== 'string' || !(body[k] as string).trim()) throw new WishItemUpdateError();
        const parsed = parseOptionalCurrency(body[k]); if (!parsed.ok) throw new WishItemUpdateError();
        patch[k] = parsed.value;
    }
    return patch;
}

type Access = { ownerId: number; isPublic: boolean; isHidden: boolean; isPurchased: boolean; purchasedById: number | null };
export function authorizeWishItemPatch(patch: WishItemPatch, actor: number, item: Access) {
    if (actor === item.ownerId) return;
    // Gift fulfillment remains available on a visible public wish, but never
    // private/hidden wishes or fields owned by the wisher (even falsy values).
    if (!item.isPublic || item.isHidden || Object.keys(patch).some(k => k !== 'isPurchased') || patch.isPurchased === undefined) throw new WishItemUpdateError(403);
    if (item.isPurchased && item.purchasedById !== actor) throw new WishItemUpdateError(409);
}
