/** A single ASCII mailbox only; never accept display names, lists or header controls. */
export function isReplyMailbox(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u0020\u007f]/u.test(value)) return false;
    const parts = value.split('@');
    if (parts.length !== 2) return false;
    const [local, domain] = parts;
    return local.length > 0 && local.length <= 64 &&
        /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
        !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
        domain.length <= 253 && domain.includes('.') &&
        domain.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
