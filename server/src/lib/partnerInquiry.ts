import { isIP } from 'node:net';

export const PARTNER_CATEGORIES = ['FURNITURE', 'BOOKS', 'ELECTRONICS', 'CAMERA', 'MUSIC', 'TOYS', 'FASHION', 'OTHER'] as const;
export const PARTNER_UPDATE_METHODS = ['API', 'CSV', 'MANUAL', 'OTHER'] as const;

export class PartnerInquiryInputError extends Error {
    constructor(readonly field: string) { super('合作資料格式不正確'); }
}

function text(raw: unknown, field: string, min: number, max: number, multiline = false) {
    if (typeof raw !== 'string') throw new PartnerInquiryInputError(field);
    const value = raw.trim();
    if (value.length < min || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value))
        throw new PartnerInquiryInputError(field);
    return value;
}

function httpsUrl(raw: unknown, field: string) {
    const value = text(raw, field, 1, 500);
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
            isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
            !host.includes('.') || /[^a-z0-9.-]/u.test(host)) throw new Error('invalid');
        return url.toString();
    } catch { throw new PartnerInquiryInputError(field); }
}

export function parsePartnerInquiry(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PartnerInquiryInputError('body');
    const body = raw as Record<string, unknown>;
    const allowed = ['organization', 'contactName', 'contactEmail', 'websiteUrl', 'categories',
        'estimatedActiveItems', 'updateMethod', 'sampleUrls', 'message', 'contactConsent', 'companyFax'];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new PartnerInquiryInputError('body');
    if (body.contactConsent !== true) throw new PartnerInquiryInputError('contactConsent');
    const email = text(body.contactEmail, 'contactEmail', 5, 254).toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new PartnerInquiryInputError('contactEmail');
    if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > 8 ||
        body.categories.some(value => typeof value !== 'string' || !PARTNER_CATEGORIES.includes(value as typeof PARTNER_CATEGORIES[number])) ||
        new Set(body.categories).size !== body.categories.length) throw new PartnerInquiryInputError('categories');
    if (!PARTNER_UPDATE_METHODS.includes(body.updateMethod as typeof PARTNER_UPDATE_METHODS[number]))
        throw new PartnerInquiryInputError('updateMethod');
    if (body.estimatedActiveItems !== undefined && body.estimatedActiveItems !== null &&
        (!Number.isInteger(body.estimatedActiveItems) || Number(body.estimatedActiveItems) < 0 || Number(body.estimatedActiveItems) > 1_000_000))
        throw new PartnerInquiryInputError('estimatedActiveItems');
    if (body.sampleUrls !== undefined && (!Array.isArray(body.sampleUrls) || body.sampleUrls.length > 3))
        throw new PartnerInquiryInputError('sampleUrls');
    const sampleUrls = (body.sampleUrls ?? []) as unknown[];
    const parsedUrls = sampleUrls.map(value => httpsUrl(value, 'sampleUrls'));
    if (new Set(parsedUrls).size !== parsedUrls.length) throw new PartnerInquiryInputError('sampleUrls');
    const result = {
        organization: text(body.organization, 'organization', 2, 120),
        contactName: text(body.contactName, 'contactName', 2, 80),
        contactEmail: email,
        websiteUrl: body.websiteUrl ? httpsUrl(body.websiteUrl, 'websiteUrl') : null,
        categories: body.categories as string[],
        estimatedActiveItems: body.estimatedActiveItems == null ? null : Number(body.estimatedActiveItems),
        updateMethod: body.updateMethod as string,
        sampleUrls: parsedUrls,
        message: body.message ? text(body.message, 'message', 1, 1000, true) : null,
    };
    return { ...result, isHoneypot: typeof body.companyFax === 'string' && body.companyFax.trim() !== '' };
}
