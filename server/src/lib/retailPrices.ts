import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { discoveryHash, DiscoveryError, type DiscoveryProduct } from './discovery';
export function retailIdentity(p: Pick<DiscoveryProduct, 'title' | 'mainId' | 'subId'>): string | null {
    if (/非正品|仿品|仿冒|造型款|replica|knockoff/i.test(p.title))
        return null;
    const t = p.title.normalize('NFKC').toLowerCase(), capacity = t.match(/(\d{2,4})\s*(gb|g|tb)(?![a-z])/);
    if (/手機殼|保護殼|保護貼|玻璃貼|鏡頭框|phone case|screen protector/.test(t)) return null;
    const lego = t.match(/(?:lego|樂高)[^\d]{0,24}(\d{4,6})\b/);
    if (lego) return 'lego:set:' + lego[1];
    if (p.mainId === 'books') {
        if (p.subId === 'comics' && !/漫畫|漫画|comic/.test(t)) return null;
        const isbn = t.match(/(?:isbn[:： ]*)?(97[89][\d-]{10,16})/);
        if (isbn) return 'book:isbn:' + isbn[1].replace(/-/g, '');
        const quoted = t.match(/[《〈]([^》〉]+)[》〉]/);
        const name = (quoted?.[1] ?? t.split(/…|\.\.\.|市售價|建議售價|新品原價|定價|原價|NT\$|TWD/i)[0]).replace(/[（(][^）)]*[）)]/g, '').replace(/二手|精裝|平裝|童書|繪本|四大名著|漫畫版|漫畫|硬殼/g, '').replace(/[^\p{L}\p{N}]/gu, '').replace(/0+(\d+)$/, '$1');
        return name.length >= 2 ? 'book:title:' + name + (p.subId === 'comics' ? ':comics' : '') : null;
    }
    const iphone = t.match(/iphone\s*(\d{1,2})\s*(pro\s*max|pro|plus|mini)?/);
    if (iphone)
        return capacity ? 'iphone:' + iphone[1] + ':' + (iphone[2] ?? 'base').replace(/\s/g, '') + ':' + capacity[1] + (capacity[2] === 'g' ? 'gb' : capacity[2]) : null;
    const buds = t.match(/galaxy\s*buds\s*(\d+)\s*(pro|fe)?\b/);
    if (buds)
        return 'samsung:galaxy-buds:' + buds[1] + ':' + (buds[2] ?? 'base');
    const model = t.match(/\b[a-z][a-z0-9-]*\d[a-z0-9-]{3,}\b/g)?.find(x => !/^hdmi|^usb|^wifi|^bluetooth|^fullhd|^ddr|^twd|^ntd/.test(x));
    return model ? p.mainId + ':' + p.subId + ':' + model.replace(/-/g, '') + (/follow\s*me|移動式.*螢幕組/.test(t) ? ':followme-bundle' : '') : null;
}
export const retailBinding = (p: DiscoveryProduct) => discoveryHash({ key: p.key, title: p.title, description: p.description.slice(0, 1200), identity: retailIdentity(p) });
export type RetailReference = {
    id: string;
    key: string;
    productKey: string;
    bindingHash: string;
    identity: string;
    price: number;
    currency: 'TWD';
    priceType: 'MANUFACTURER_MSRP' | 'RETAIL_REGULAR';
    sourceUrl: string;
    sourceTitle: string;
    sourceProductTitle: string;
    evidenceQuote: string;
    sourcePeriod: string | null;
    checkedAt: string;
};
const manufacturerHosts: Record<string, RegExp> = { 'samsung.com': /samsung|三星|galaxy/i, 'apple.com': /apple|蘋果|iphone|ipad|macbook|imac/i, 'sony.com.tw': /sony|索尼|playstation/i, 'sony.com': /sony|playstation/i, 'benq.com': /benq|明基/i, 'nike.com': /nike|耐吉/i, 'asus.com': /asus|華碩/i, 'acer.com': /acer|宏碁/i, 'lg.com': /\blg\b|樂金/i, 'logitech.com': /logitech|羅技/i, 'dell.com': /dell|戴爾/i, 'lenovo.com': /lenovo|聯想/i, 'lego.com': /lego|樂高/i, 'seikowatches.com': /seiko|精工/i, 'whirlpool.com.tw': /whirlpool|惠而浦/i, 'heran.com.tw': /heran|禾聯/i, 'sampo.com.tw': /sampo|聲寶/i, 'adidas.com.tw': /adidas|愛迪達/i };
const retailerHosts = ['pchome.com.tw', 'momoshop.com.tw', 'costco.com.tw', 'senao.com.tw', 'myfone.com.tw', 'eclife.com.tw', 'tk3c.com', 'books.com.tw', 'sanmin.com.tw', 'kingstone.com.tw', 'lcstw.com.tw'];
function originalUrl(value: unknown, kind: string, product: DiscoveryProduct) { if (typeof value !== 'string' || value.length > 1800)
    throw new DiscoveryError(400, 'RETAIL_INVALID_SOURCE'); let u: URL; try {
    u = new URL(value);
}
catch {
    throw new DiscoveryError(400, 'RETAIL_INVALID_SOURCE');
} if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash)
    throw new DiscoveryError(400, 'RETAIL_INVALID_SOURCE'); const within = (h: string) => u.hostname === h || u.hostname.endsWith('.' + h); if (kind === 'MANUFACTURER_MSRP') {
    const brand = Object.entries(manufacturerHosts).find(([h]) => within(h));
    if (!brand || !brand[1].test(product.title))
        throw new DiscoveryError(400, 'RETAIL_SOURCE_BRAND_MISMATCH');
}
else if (!retailerHosts.some(within))
    throw new DiscoveryError(400, 'RETAIL_INVALID_SOURCE'); return u.href; }
export function retailObservation(value: unknown, p: DiscoveryProduct, now = new Date()) {
    const b = value as Record<string, unknown>;
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['requestId', 'productKey', 'bindingHash', 'status', 'originalPrice', 'currency', 'priceType', 'sourceUrl', 'sourceTitle', 'sourceProductTitle', 'sourcePeriod', 'evidenceQuote', 'checkedAt', 'notes'].includes(k)) || typeof b.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.requestId) || b.productKey !== p.key || b.bindingHash !== retailBinding(p) || !['VERIFIED', 'NOT_FOUND', 'NEEDS_SPEC'].includes(String(b.status)))
        throw new DiscoveryError(400, 'RETAIL_INVALID_OBSERVATION');
    const checkedAt = typeof b.checkedAt === 'string' ? new Date(b.checkedAt) : new Date(NaN);
    if (!Number.isFinite(+checkedAt) || +checkedAt > +now + 300000 || +checkedAt < +now - 86400000)
        throw new DiscoveryError(400, 'RETAIL_INVALID_DATE');
    const text = (key: string, max: number, required = false) => { const v = b[key]; if (v === undefined || v === null) {
        if (required)
            throw new DiscoveryError(400, 'RETAIL_INVALID_OBSERVATION');
        return null;
    } if (typeof v !== 'string' || v.trim().length < (required ? 1 : 0) || v.length > max || /[<>\u0000-\u001f]/.test(v) || /09\d{8}|line\s*(?:id|[:：])|@/i.test(v))
        throw new DiscoveryError(400, 'RETAIL_INVALID_OBSERVATION'); return v.trim(); };
    const notes = text('notes', 500, b.status !== 'VERIFIED'), identity = retailIdentity(p), period = text('sourcePeriod', 10);
    if (period && !/^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/.test(period))
        throw new DiscoveryError(400, 'RETAIL_INVALID_DATE');
    let originalPrice: Prisma.Decimal | null = null, sourceUrl: string | null = null, sourceTitle: string | null = null, sourceProductTitle: string | null = null, evidenceQuote: string | null = null, priceType: string | null = null;
    if (b.status === 'VERIFIED') {
        if (!identity || b.currency !== 'TWD' || !['MANUFACTURER_MSRP', 'RETAIL_REGULAR'].includes(String(b.priceType)) || typeof b.originalPrice !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(b.originalPrice) || Number(b.originalPrice) <= 0)
            throw new DiscoveryError(400, 'RETAIL_INVALID_PRICE');
        priceType = String(b.priceType);
        sourceUrl = originalUrl(b.sourceUrl, priceType, p);
        sourceTitle = text('sourceTitle', 300, true);
        sourceProductTitle = text('sourceProductTitle', 240, true);
        evidenceQuote = text('evidenceQuote', 350, true);
        if (retailIdentity({ ...p, title: sourceProductTitle! }) !== identity || retailIdentity({ ...p, title: evidenceQuote! }) !== identity)
            throw new DiscoveryError(400, 'RETAIL_VARIANT_MISMATCH');
        const normalized = evidenceQuote!.normalize('NFKC').replace(/,/g, '');
        // PChome separates its regular 網路價 from 折扣價. Keep that label
        // retailer-specific, and never accept a promotional prefix as regular.
        const sourceHost = new URL(sourceUrl).hostname;
        const pchomeRegularLabel = priceType === 'RETAIL_REGULAR' && (sourceHost === 'pchome.com.tw' || sourceHost.endsWith('.pchome.com.tw'))
            ? '|網路價' : '';
        const label = priceType === 'MANUFACTURER_MSRP' ? '建議售價|建議零售價|新品原價|原價|定價|MSRP|RRP' : '建議售價|建議零售價|新品原價|原價|定價|一般售價|市售價|MSRP|RRP|regular price' + pchomeRegularLabel;
        const amountPattern = new RegExp('(?:' + label + ')\\s*[:：]?\\s*(?:(?:NT\\$?|NTD|TWD|新台幣|新臺幣|\\$)\\s*(\\d+(?:\\.\\d{1,2})?)|(\\d+(?:\\.\\d{1,2})?)\\s*元)', 'gi');
        const amounts = [...normalized.matchAll(amountPattern)]
            .filter(x => !x[0].startsWith('網路價') || !/(?:促銷|優惠|限時|特價|折扣|折後|券後)\s*[:：-]?\s*$/.test(normalized.slice(0, x.index)))
            .map(x => Number(x[1] ?? x[2]));
        if (/人民幣|RMB|CNY|HKD|港幣|日圓|JPY|SGD|USD/i.test(normalized)) throw new DiscoveryError(400, 'RETAIL_INVALID_PRICE');
        if (!amounts.includes(Number(b.originalPrice)))
            throw new DiscoveryError(400, 'RETAIL_PRICE_NOT_IN_EVIDENCE');
        originalPrice = new Prisma.Decimal(b.originalPrice);
    }
    else if (['originalPrice', 'sourceUrl', 'sourceProductTitle', 'evidenceQuote'].some(k => b[k] !== undefined && b[k] !== null))
        throw new DiscoveryError(400, 'RETAIL_INVALID_OBSERVATION');
    const data = { id: b.requestId, productKey: p.key, bindingHash: retailBinding(p), identity, status: String(b.status), originalPrice, currency: 'TWD', priceType, sourceUrl, sourceTitle, sourceProductTitle, sourcePeriod: period, evidenceQuote, checkedAt, expiresAt: new Date(+checkedAt + (b.status === 'VERIFIED' ? 14 : 7) * 86400000), notes };
    return { ...data, payloadHash: discoveryHash(data) };
}
export async function retailReferences(products: DiscoveryProduct[], now = new Date()) {
    const rows = await prisma.retailPriceObservation.findMany({ where: { productKey: { in: products.map(p => p.key) }, status: 'VERIFIED', expiresAt: { gt: now } }, orderBy: { checkedAt: 'desc' }, take: 5000 });
    const byKey = new Map(products.map(p => [p.key, p])), out = new Map<string, RetailReference>();
    for (const r of rows) {
        const p = byKey.get(r.productKey);
        if (!p || r.currency !== 'TWD' || Number(r.originalPrice) <= 0 || r.bindingHash !== retailBinding(p) || !r.identity || r.identity !== retailIdentity(p) || !r.originalPrice || !r.sourceUrl || !r.sourceTitle || !r.sourceProductTitle || !r.evidenceQuote || !['MANUFACTURER_MSRP', 'RETAIL_REGULAR'].includes(r.priceType ?? ''))
            continue;
        const fact: RetailReference = { id: r.id, key: 'retail:' + r.id, productKey: r.productKey, bindingHash: r.bindingHash, identity: r.identity, price: Number(r.originalPrice), currency: 'TWD', priceType: r.priceType as RetailReference['priceType'], sourceUrl: r.sourceUrl, sourceTitle: r.sourceTitle, sourceProductTitle: r.sourceProductTitle, evidenceQuote: r.evidenceQuote, sourcePeriod: r.sourcePeriod, checkedAt: r.checkedAt.toISOString() };
        const old = out.get(r.productKey);
        if (!old || old.priceType !== 'MANUFACTURER_MSRP' && fact.priceType === 'MANUFACTURER_MSRP' || old.priceType === fact.priceType && fact.price < old.price)
            out.set(r.productKey, fact);
    }
    return out;
}
export function retailConversion(price: number, original: number) { return { originalPrice: original, priceRatio: Math.round(price / original * 100) / 10, savingsPercent: Math.round((1 - price / original) * 1000) / 10, pricePoints: Math.round(Math.max(0, Math.min(1, 1 - price / original)) * 40) }; }
