import { createHash } from 'crypto';
import { parseWishItemPatch } from './wishItemUpdate';
import { DEFAULT_CURRENCY } from './matchmakingPrice';
export class NativeWishError extends Error { constructor(public status = 400) { super('Wish request rejected'); } }
export function wishId(raw: unknown) {
    if (!['string', 'number'].includes(typeof raw) || !/^[1-9]\d{0,9}$/.test(String(raw)) || Number(raw) > 2147483647) throw new NativeWishError();
    return Number(raw);
}
function object(raw: unknown, allowed: string[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new NativeWishError();
    const body = raw as Record<string, unknown>;
    if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) throw new NativeWishError();
    return body;
}
export function wishRequestId(raw: unknown): string {
    if (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) throw new NativeWishError();
    return raw.toLowerCase();
}
export function nativeWishlistPatch(raw: unknown) {
    const body = object(raw, ['title', 'description', 'isPublic']);
    const patch: { title?: string; description?: string | null; isPublic?: boolean } = {};
    if ('title' in body) {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 || /[\u0000-\u001f\u007f]/.test(body.title)) throw new NativeWishError();
        patch.title = body.title.trim();
    }
    if ('description' in body) {
        if (!(body.description === null || (typeof body.description === 'string' && body.description.length <= 1000 && !body.description.includes('\u0000')))) throw new NativeWishError();
        patch.description = body.description as string | null;
    }
    if ('isPublic' in body) { if (typeof body.isPublic !== 'boolean') throw new NativeWishError(); patch.isPublic = body.isPublic; }
    return patch;
}
export function nativeWishCreate(raw: unknown) {
    const body = object(raw, ['clientRequestId', 'name', 'notes', 'link', 'maxPrice', 'priceCurrency']);
    const clientRequestId = wishRequestId(body.clientRequestId);
    const { clientRequestId: _, ...input } = body;
    const patch = parseWishItemPatch(input);
    if (!patch.name || (patch.maxPrice === undefined || patch.maxPrice === null) && patch.priceCurrency !== undefined) throw new NativeWishError();
    return { clientRequestId, data: { name: patch.name, notes: patch.notes ?? null, link: patch.link ?? null, maxPrice: patch.maxPrice ?? null, priceCurrency: patch.maxPrice !== undefined && patch.maxPrice !== null ? patch.priceCurrency ?? DEFAULT_CURRENCY : null } };
}
export function nativeListCreate(raw: unknown) {
    const body = object(raw, ['clientRequestId', 'title', 'description', 'isPublic']);
    const clientRequestId = wishRequestId(body.clientRequestId);
    const { clientRequestId: _, ...input } = body;
    const patch = nativeWishlistPatch(input); if (!patch.title) throw new NativeWishError();
    return { clientRequestId, data: { title: patch.title, description: patch.description ?? null, isPublic: patch.isPublic ?? false } };
}
export function wishCreateHash(kind: string, parent: number | null, data: object) {
    return createHash('sha256').update(JSON.stringify([kind, parent, data])).digest('hex');
}
