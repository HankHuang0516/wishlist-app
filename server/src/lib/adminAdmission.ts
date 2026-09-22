import { createHash, timingSafeEqual } from 'node:crypto';

export type AdminAdmission = 'DISABLED' | 'DENIED' | 'AUTHORIZED';

// Marketplace moderation uses only the existing server-held admin credential.
// Callers pass the x-admin-key header explicitly, never a query value, JWT role,
// body property or a key embedded in the mobile bundle. No value is logged.
export function adminHeaderAdmission(expected: unknown, supplied: unknown): AdminAdmission {
    if (typeof expected !== 'string' || !expected || expected.length > 4096) return 'DISABLED';
    if (typeof supplied !== 'string' || !supplied || supplied.length > 4096) return 'DENIED';
    // Fixed-length digests avoid timingSafeEqual length exceptions. Do not trim
    // or normalize credentials: an altered header must never become the key.
    const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
    return timingSafeEqual(digest(expected), digest(supplied)) ? 'AUTHORIZED' : 'DENIED';
}
