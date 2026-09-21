export class AccountSecurityError extends Error { constructor(public status = 400) { super('Account operation rejected'); } }
export function boundedPassword(raw: unknown): string {
    if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw, 'utf8') > 1024 || raw.includes('\u0000')) throw new AccountSecurityError();
    return raw;
}
export function strongNewPassword(raw: unknown): string {
    const value = boundedPassword(raw);
    if (Buffer.byteLength(value, 'utf8') > 72 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/.test(value)) throw new AccountSecurityError();
    return value;
}
export function validNewPassword(raw: unknown): boolean {
    try { strongNewPassword(raw); return true; } catch { return false; }
}
export function nextAuthVersion(raw: number): number {
    if (!Number.isInteger(raw) || raw < 0 || raw >= 2147483647) throw new AccountSecurityError(409);
    return raw + 1;
}
export function securityBody(raw: unknown, allowed: string[]): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !allowed.includes(k))) throw new AccountSecurityError();
    return raw as Record<string, unknown>;
}
