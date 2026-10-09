import { createHash } from 'crypto';
export class LeadError extends Error {
}
const canonical = (v: any): any => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const ref = (v: unknown): v is string => typeof v === 'string' && /^(?:self|review|source|consent):[A-Za-z0-9._/-]{4,180}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
export function publicUrl(v: unknown, host?: string) {
    if (!text(v, 2048))
        throw new LeadError('INVALID_PUBLIC_URL');
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || u.pathname === '/' || (host && u.hostname !== host))
        throw new LeadError('INVALID_PUBLIC_URL');
    // No private/loopback destinations. UI opens links only; backend never fetches them.
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname))
        throw new LeadError('INVALID_PUBLIC_URL');
    return u.href;
}
