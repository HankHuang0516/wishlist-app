import { createHash } from 'crypto';

export class ProfileUpdateError extends Error {
    constructor(public status = 400) { super('Profile operation rejected'); }
}
const textLimits: Record<string, number> = { name: 50, realName: 100, address: 500, nicknames: 254, email: 254, avatarUrl: 2048 };
const flags = ['isAvatarVisible', 'isPhoneVisible', 'isRealNameVisible', 'isAddressVisible', 'isEmailVisible', 'isBirthdayVisible', 'marketingEmailsEnabled'];
export function profilePatch(value: unknown): Record<string, string | boolean | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProfileUpdateError();
    const keys = Object.keys(value).sort();
    if (!keys.length || keys.some(key => ![...Object.keys(textLimits), ...flags, 'birthday'].includes(key))) throw new ProfileUpdateError();
    const source = value as Record<string, unknown>, result: Record<string, string | boolean | null> = {};
    for (const key of keys) {
        let raw = source[key];
        if (flags.includes(key)) {
            if (typeof raw !== 'boolean') throw new ProfileUpdateError();
            result[key] = raw; continue;
        }
        if (key === 'nicknames' && Array.isArray(raw)) {
            if (raw.length > 5 || raw.some(part => typeof part !== 'string' || part.includes(','))) throw new ProfileUpdateError();
            raw = raw.join(',');
        }
        if (raw !== null && (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/.test(raw) || Buffer.from(raw).toString('utf8') !== raw)) throw new ProfileUpdateError();
        if (key === 'birthday') {
            if (raw === null || raw === '') { result[key] = null; continue; }
            const day = typeof raw === 'string' && raw.length === 24 && raw.endsWith('T00:00:00.000Z') ? raw.slice(0, 10) : raw;
            if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '1900-01-01' || day > new Date().toISOString().slice(0, 10) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new ProfileUpdateError();
            result[key] = day; continue;
        }
        const text = typeof raw === 'string' ? raw.trim() : null;
        if (text !== null && text.length > textLimits[key]) throw new ProfileUpdateError();
        if (key === 'name' && !text) throw new ProfileUpdateError();
        if (key === 'nicknames') {
            const parts = (text ?? '').split(',').map(part => part.trim()).filter(Boolean);
            if (parts.length > 5 || parts.some(part => part.length > 50)) throw new ProfileUpdateError();
            result[key] = parts.join(','); continue;
        }
        if (key === 'email' && (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))) throw new ProfileUpdateError();
        if (key === 'avatarUrl' && text) {
            try {
                const url = new URL(text, 'https://profile.invalid');
                if (url.username || url.password || url.protocol !== 'https:' || !text.startsWith('https://') && !/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(text)) throw new Error();
            } catch { throw new ProfileUpdateError(); }
        }
        result[key] = text || null;
    }
    return result;
}
export function profileVersion(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0 || raw >= 2147483647) throw new ProfileUpdateError();
    return raw;
}
export function profileActionId(raw: unknown) {
    if (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) throw new ProfileUpdateError();
    return raw.toLowerCase();
}
export function profileHash(expectedVersion: number, updates: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify({ expectedVersion, updates })).digest('hex');
}
export function profileData(patch: Record<string, string | boolean | null>) {
    return { ...patch, ...(Object.prototype.hasOwnProperty.call(patch, 'birthday') ? { birthday: patch.birthday ? new Date(patch.birthday as string) : null } : {}), profileVersion: { increment: 1 } };
}
