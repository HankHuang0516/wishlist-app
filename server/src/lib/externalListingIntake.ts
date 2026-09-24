import { createHash } from 'crypto';
import { forbiddenListingField, privateContactField } from './listingPolicy';

export class ExternalIntakeError extends Error {
    constructor(readonly field: string, message = '外部商品資料不完整或不符合授權條件') { super(message); }
}

type SourcePolicy = { canonicalHost: string; imageHost: string | null; imageReuseAllowed: boolean; textReuseAllowed: boolean };
// City-maintained administrative district lists, checked 2026-09-25:
// https://www.gov.taipei/cp.aspx?n=1F076481DD9E556B
// https://www.ca.ntpc.gov.tw/new/home.jsp?id=0de11fd46b419ad1
const DOUBLE_NORTH_DISTRICTS = {
    '臺北市': new Set(['松山區', '信義區', '大安區', '中山區', '中正區', '大同區', '萬華區', '文山區', '南港區', '內湖區', '士林區', '北投區']),
    '新北市': new Set(['板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區',
        '鶯歌區', '三峽區', '淡水區', '瑞芳區', '五股區', '泰山區', '林口區', '八里區', '深坑區', '石碇區',
        '坪林區', '三芝區', '石門區', '金山區', '萬里區', '平溪區', '雙溪區', '貢寮區', '烏來區']),
} as const;
const own = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExternalIntakeError('body');
    return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, allowed: string[]) => {
    const extra = Object.keys(value).find(key => !allowed.includes(key));
    if (extra) throw new ExternalIntakeError(extra);
};
const word = (value: unknown, field: string, min: number, max: number) => {
    if (typeof value !== 'string') throw new ExternalIntakeError(field);
    const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < min || normalized.length > max) throw new ExternalIntakeError(field);
    return normalized;
};
const host = (value: unknown, field: string) => {
    const hostname = word(value, field, 4, 253).toLowerCase();
    if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname) ||
        hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new ExternalIntakeError(field);
    return hostname;
};
const httpsOnHost = (value: unknown, field: string, expectedHost: string) => {
    if (typeof value !== 'string' || value.length > 2048) throw new ExternalIntakeError(field);
    let url: URL;
    try { url = new URL(value); } catch { throw new ExternalIntakeError(field); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname.toLowerCase() !== expectedHost ||
        url.pathname === '/' || /[\u0000-\u001f]/.test(value)) throw new ExternalIntakeError(field);
    url.hash = '';
    return url.href;
};
const date = (value: unknown, field: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw new ExternalIntakeError(field);
    const result = new Date(value);
    if (!Number.isFinite(result.getTime())) throw new ExternalIntakeError(field);
    return result;
};

export function parseExternalSource(input: unknown) {
    const value = own(input);
    exactKeys(value, ['name', 'kind', 'canonicalHost', 'imageHost', 'authorizationRef', 'textReuseAllowed', 'imageReuseAllowed', 'aiProcessingAllowed']);
    const name = word(value.name, 'name', 3, 100);
    const kind = value.kind;
    if (!['PARTNER_FEED', 'LINE_OPT_IN', 'SELLER_IMPORT'].includes(String(kind))) throw new ExternalIntakeError('kind');
    const canonicalHost = host(value.canonicalHost, 'canonicalHost');
    const imageHost = value.imageHost === undefined || value.imageHost === null ? null : host(value.imageHost, 'imageHost');
    const authorizationRef = word(value.authorizationRef, 'authorizationRef', 8, 200);
    if (!/^(?:contract|consent|license|self):[A-Za-z0-9._/-]{4,160}$/.test(authorizationRef))
        throw new ExternalIntakeError('authorizationRef', '請只填授權文件或同意紀錄的參照 ID，不要填憑證或原文');
    if (typeof value.textReuseAllowed !== 'boolean' || typeof value.imageReuseAllowed !== 'boolean' ||
        typeof value.aiProcessingAllowed !== 'boolean') throw new ExternalIntakeError('rights');
    if (value.imageReuseAllowed && !imageHost) throw new ExternalIntakeError('imageHost');
    if (value.aiProcessingAllowed && !value.imageReuseAllowed) throw new ExternalIntakeError('aiProcessingAllowed', 'AI 分析圖片前須取得圖片使用與 AI 處理兩項明確授權');
    return { name, kind: kind as 'PARTNER_FEED' | 'LINE_OPT_IN' | 'SELLER_IMPORT', canonicalHost, imageHost,
        authorizationRef, textReuseAllowed: value.textReuseAllowed, imageReuseAllowed: value.imageReuseAllowed,
        aiProcessingAllowed: value.aiProcessingAllowed };
}

export function parseExternalCandidate(input: unknown, source: SourcePolicy, now = new Date()) {
    const value = own(input);
    exactKeys(value, ['sourceItemId', 'canonicalUrl', 'imageUrl', 'title', 'description', 'priceTwd', 'condition', 'county', 'district', 'observedAt', 'expiresAt']);
    const sourceItemId = word(value.sourceItemId, 'sourceItemId', 1, 160);
    const canonicalUrl = httpsOnHost(value.canonicalUrl, 'canonicalUrl', source.canonicalHost);
    const imageUrl = value.imageUrl === undefined || value.imageUrl === null ? null :
        source.imageReuseAllowed && source.imageHost ? httpsOnHost(value.imageUrl, 'imageUrl', source.imageHost) : (() => { throw new ExternalIntakeError('imageUrl', '來源尚未授權顯示圖片'); })();
    const title = word(value.title, 'title', 3, 120);
    const description = value.description === undefined || value.description === null ? null :
        source.textReuseAllowed ? word(value.description, 'description', 1, 1500) : (() => { throw new ExternalIntakeError('description', '來源尚未授權重用商品描述'); })();
    if (forbiddenListingField({ title, description }) || privateContactField({ title, description })) throw new ExternalIntakeError('title', '商品內容含禁售或私人聯絡資料');
    if (value.condition !== 'USED' && value.condition !== 'NEW') throw new ExternalIntakeError('condition');
    const county = word(value.county, 'county', 3, 5);
    if (!['臺北市', '台北市', '新北市'].includes(county)) throw new ExternalIntakeError('county', '目前只接受雙北商品');
    const district = word(value.district, 'district', 2, 12);
    const normalizedCounty = county === '台北市' ? '臺北市' : county;
    if (!DOUBLE_NORTH_DISTRICTS[normalizedCounty as keyof typeof DOUBLE_NORTH_DISTRICTS].has(district))
        throw new ExternalIntakeError('district', '行政區與縣市不符');
    const priceTwd = value.priceTwd;
    if (typeof priceTwd !== 'number' || !Number.isSafeInteger(priceTwd) || priceTwd < 1 || priceTwd > 10_000_000) throw new ExternalIntakeError('priceTwd', '需提供來源明示的商品售價');
    const observedAt = date(value.observedAt, 'observedAt'), expiresAt = date(value.expiresAt, 'expiresAt');
    if (observedAt.getTime() > now.getTime() + 5 * 60_000 || now.getTime() - observedAt.getTime() > 48 * 3_600_000 ||
        expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > observedAt.getTime() + 30 * 86_400_000) throw new ExternalIntakeError('expiresAt', '來源資料須近期確認且最遲 30 天內失效');
    const data = { sourceItemId, canonicalUrl, imageUrl, title, description, priceTwd, condition: value.condition,
        county: normalizedCounty, district, observedAt, expiresAt };
    // Observation/expiry refreshes are freshness updates, not new content for
    // an AI reviewer to re-enrich on every scheduled feed check.
    const { observedAt: _observedAt, expiresAt: _expiresAt, ...content } = data;
    const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    return { ...data, contentHash };
}
