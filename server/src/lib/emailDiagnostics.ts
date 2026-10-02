/** Explicit operator admission. A phone number, JWT role, API key or request
 * property must never grant access to the mail diagnostic tool. Invalid or
 * absent configuration leaves it unavailable; enabling it is a separate choice. */
export function emailDiagnosticsAllowed(userId: number): boolean {
    const raw = process.env.EMAIL_DIAGNOSTICS_ADMIN_USER_IDS?.trim();
    if (!raw || raw.length > 512) return false;
    const ids = raw.split(',').map(value => value.trim());
    if (ids.length > 32 || ids.some(value => !/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647)) return false;
    return ids.some(value => Number(value) === userId);
}

export function emailDiagnosticsEnabled(): boolean {
    return process.env.EMAIL_DIAGNOSTICS_ENABLED?.trim() === 'true';
}
