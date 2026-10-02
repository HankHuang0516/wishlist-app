import { API_BASE_URL, API_URL } from '../config';
export class HistoryReadError extends Error { readonly authentication: boolean; constructor(authentication = false) { super('History read unavailable'); this.authentication = authentication; } }
export type AccountTransaction = { id: number; type: string; amount: number; currency: string; status: string; createdAt: string };
export type ClaimedItem = { id: number; updatedAt: string; unavailable: true } | { id: number; updatedAt: string; unavailable: false; name: string; price: string | null; currency: string | null; link: string | null; imageUrl: string | null; wishlist: { title: string; user: { id: number; name: string | null; nicknames: string | null; avatarUrl: string | null } } };
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HistoryReadError(); return v as Record<string, unknown>; };
const id = (v: unknown) => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > 2147483647) throw new HistoryReadError(); return v; };
const text = (v: unknown, max: number) => { if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) throw new HistoryReadError(); return v; };
const nullable = (v: unknown, max: number) => v === null ? null : text(v, max);
const date = (v: unknown) => { const s = text(v, 24); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) throw new HistoryReadError(); return s; };
function rows<T>(raw: unknown, parse: (row: Record<string, unknown>) => T & { id: number }): T[] {
    if (!Array.isArray(raw)) throw new HistoryReadError(); const seen = new Set<number>();
    return raw.map(v => { const row = parse(object(v)); if (seen.has(row.id)) throw new HistoryReadError(); seen.add(row.id); return row; });
}
export function parseAccountHistory(raw: unknown): AccountTransaction[] {
    return rows(raw, r => { if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) throw new HistoryReadError();
        return { id: id(r.id), type: text(r.type, 100), amount: r.amount, currency: text(r.currency, 16), status: text(r.status, 100), createdAt: date(r.createdAt) }; });
}
export function parseClaimHistory(raw: unknown): ClaimedItem[] {
    return rows<ClaimedItem>(raw, r => {
        const base = { id: id(r.id), updatedAt: date(r.updatedAt) };
        if (r.unavailable === true) { if (Object.keys(r).some(k => !['id','updatedAt','unavailable'].includes(k))) throw new HistoryReadError(); return { ...base, unavailable: true }; }
        if (r.unavailable !== false) throw new HistoryReadError(); const w = object(r.wishlist), u = object(w.user);
        return { ...base, unavailable: false, name: text(r.name, 200), price: nullable(r.price, 200), currency: nullable(r.currency, 16), link: nullable(r.link, 2048), imageUrl: nullable(r.imageUrl, 2048), wishlist: { title: text(w.title, 200), user: { id: id(u.id), name: nullable(u.name, 100), nicknames: nullable(u.nicknames, 254), avatarUrl: nullable(u.avatarUrl, 2048) } } };
    });
}
export function historyLink(value: string | null) {
    if (!value || /[\s\u0000-\u001f\u007f]/.test(value)) return undefined;
    try { const url = new URL(value); if (['http:','https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Unsafe URLs have no clickable target. */ }
    return undefined;
}
export function historyImage(value: string | null) {
    if (value && /^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(value) && !value.includes('..')) return API_BASE_URL + value;
    return historyLink(value);
}
export async function readHistory<T>(kind: 'account' | 'claims', token: string, signal: AbortSignal, parse: (raw: unknown) => T): Promise<T> {
    const res = await fetch(`${API_URL}/users/me/${kind === 'account' ? 'transaction-history' : 'purchases'}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!res.ok) throw new HistoryReadError(res.status === 401 || res.status === 403);
    const raw: unknown = await res.json(); if (signal.aborted) throw new HistoryReadError(); return parse(raw);
}
