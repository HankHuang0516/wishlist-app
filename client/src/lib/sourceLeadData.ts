import { isUuid as uuid } from './listingBatch';
import { TAIWAN_DISTRICTS } from './taiwanAdministrativeDistricts';
export type LeadPhoto = { id: string; sourceUrl: string; imageUrl: string; thumbnailUrl: string; alt: string };
export type ContactRouting={status:'VERIFIED'|'UNAVAILABLE'|'UNVERIFIED';reason:string;checkedAt:string|null};
export function parseContactRouting(value:unknown):ContactRouting {
 const c=obj(value);if(Object.keys(c).some(k=>!['status','reason','checkedAt'].includes(k))||!['VERIFIED','UNAVAILABLE','UNVERIFIED'].includes(c.status)||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>240||!(c.checkedAt===null||typeof c.checkedAt==='string'&&Number.isFinite(Date.parse(c.checkedAt))))throw new Error('來源聯絡狀態錯誤');return c as ContactRouting;
}
export type SourceLead = {
    locationPrecision?:'COUNTY_ILLUSTRATION';
    contactRouting?:ContactRouting;
    media?: LeadPhoto[];
    id: string;
    kind: 'SOURCE_LEAD';
    title: string;
    summary: string;
    canonicalUrl: string;
    county: string;
    district: string;
    publicPlaceName: string;
    publicAddress: string;
    latitude: number;
    longitude: number;
    postedEarliestAt: string;
    postedLatestAt: string;
    checkedAt: string;
    stockStatus: 'UNKNOWN';
    qualifiedSupply: false;
    checkoutEnabled: false;
    notice: string;
    publicFacts: {
        priceText: string;
        priceUnitStatus: string;
        currencyStatus: string;
        sourceAccessNotice: string;
        originalDateLabel: string;
        locationRelation: string;
        coordinateQualityNotes: string[];
    } | null;
    coordinateSourceUrl: string;
    coordinateAttribution: {
        text: string;
        url: string;
        license: string;
        licenseUrl: string;
    } | null;
};
const obj = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('線索格式錯誤'); return v as Record<string, any>; };
export function sourceLeadCutoff(now = Date.now()) { const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number); const first = new Date(Date.UTC(y, m - 3, 1)), end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, end)) - 8 * 3600000; }
export function parseLead(v: unknown): SourceLead { const r = obj(v); const keys = ['id', 'kind', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'postedEarliestAt', 'postedLatestAt', 'checkedAt', 'stockStatus', 'qualifiedSupply', 'checkoutEnabled', 'notice', 'publicFacts', 'coordinateSourceUrl', 'coordinateAttribution', 'media','contactRouting','locationPrecision']; if (Object.keys(r).some(k => !keys.includes(k)) || !uuid(r.id) || r.kind !== 'SOURCE_LEAD' || r.stockStatus !== 'UNKNOWN' || r.qualifiedSupply !== false || r.checkoutEnabled !== false || (!TAIWAN_DISTRICTS[r.county]?.has(r.district)&&!(r.locationPrecision==='COUNTY_ILLUSTRATION'&&r.county==='臺北市'&&r.district==='行政區未明示')) || ['title', 'summary', 'publicPlaceName', 'publicAddress', 'notice'].some(k => typeof r[k] !== 'string' || !r[k].trim()) || r.title.length > 100 || r.summary.length > 240 || typeof r.latitude !== 'number' || r.latitude < 20 || r.latitude > 26.6 || typeof r.longitude !== 'number' || r.longitude < 117 || r.longitude > 123.8 || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude))
    throw new Error('線索格式錯誤'); if(r.locationPrecision!==undefined&&(r.locationPrecision!=='COUNTY_ILLUSTRATION'||r.publicPlaceName!==r.county+'概略示意位置'||r.publicAddress!==r.county+'（概略位置，非取貨點）'||r.coordinateAttribution!==null))throw new Error('概略位置格式錯誤'); const u = new URL(r.canonicalUrl); if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.search)
    throw new Error('來源連結錯誤'); if (r.publicFacts !== null) {
    const f = obj(r.publicFacts);
    if (Object.keys(f).some(k => !['priceText', 'priceUnitStatus', 'currencyStatus', 'sourceAccessNotice', 'originalDateLabel', 'locationRelation', 'coordinateQualityNotes'].includes(k)) || ['priceText', 'priceUnitStatus', 'currencyStatus', 'sourceAccessNotice', 'originalDateLabel', 'locationRelation'].some(k => typeof f[k] !== 'string' || !f[k] || f[k].length > 300) || !Array.isArray(f.coordinateQualityNotes) || f.coordinateQualityNotes.some((v: unknown) => typeof v !== 'string' || v.length > 500))
        throw new Error('公開事實格式錯誤');
} const cu = new URL(r.coordinateSourceUrl); if (cu.protocol !== 'https:' || cu.username || cu.password || cu.search || cu.hash)
    throw new Error('座標來源錯誤'); if (r.coordinateAttribution !== null) {
    const a = obj(r.coordinateAttribution);
    if (a.text !== '© OpenStreetMap contributors' || a.url !== 'https://www.openstreetmap.org/copyright' || a.license !== 'ODbL-1.0' || a.licenseUrl !== 'https://opendatacommons.org/licenses/odbl/1-0/')
        throw new Error('座標署名錯誤');
} if (r.media !== undefined) {
 if (!Array.isArray(r.media) || r.media.length > 8 || new Set(r.media.map((m:any)=>m.id)).size !== r.media.length) throw new Error('來源圖片映射錯誤');
 for (const m of r.media) {
  if (!m || Object.keys(m).some(k=>!['id','sourceUrl','imageUrl','thumbnailUrl','alt'].includes(k)) || !uuid(m.id) || m.sourceUrl !== r.canonicalUrl || typeof m.alt !== 'string' || !m.alt.trim() || m.alt.length > 100) throw new Error('來源圖片映射錯誤');
  const image = new URL(m.imageUrl), thumbnail = new URL(m.thumbnailUrl);
  if (image.protocol !== 'https:' || image.username || image.password || image.port || image.search || image.hash || thumbnail.origin !== image.origin || thumbnail.search || thumbnail.hash || thumbnail.username || thumbnail.password || image.pathname !== '/api/source-leads/'+r.id+'/media/'+m.id+'/image' || thumbnail.pathname !== '/api/source-leads/'+r.id+'/media/'+m.id+'/thumbnail') throw new Error('來源圖片路由錯誤');
 }
} if(r.contactRouting!==undefined)parseContactRouting(r.contactRouting); const times = [r.postedEarliestAt, r.postedLatestAt, r.checkedAt].map(Date.parse); if (times.some(v => !Number.isFinite(v)) || times[0] < sourceLeadCutoff() || times[0] > times[1] || times[1] > Date.now() || times[2] > Date.now() || Date.now() - times[2] > 48 * 3600000)
    throw new Error('線索日期失效'); return r as SourceLead; }
export function parseLeadPage(v: unknown) { const r = obj(v); if (typeof r.enabled !== 'boolean' || !Array.isArray(r.items) || r.items.length > 25 || !(r.nextCursor === null || uuid(r.nextCursor)) || (!r.enabled && (r.items.length || r.nextCursor !== null)))
    throw new Error('線索分頁錯誤'); const items = r.items.map(parseLead); if (new Set(items.map((r: SourceLead) => r.id)).size !== items.length)
    throw new Error('線索重複'); return { items: items as SourceLead[], nextCursor: r.nextCursor as string | null, enabled: r.enabled as boolean }; }
export type LeadRoom = {
    id: string;
    leadId: string;
    state: string;
    available: boolean;
    events: {
        requestId: string;
        action: string;
        text?: string;
        at: string;
    }[];
    transferHash: string;
    routeVerified: boolean;
    delivered: boolean;
    delivery: {
        at: string;
        channel: string;
        verification: string;
    } | null;
    checkoutEnabled: false;
    orderCreated: false;
    notice: string;
};
export function parseLeadRoom(v: unknown, leadId: string): LeadRoom { const r = obj(v); if (Object.keys(r).some(k => !['id', 'leadId', 'state', 'available', 'events', 'transferHash', 'routeVerified', 'delivered', 'delivery', 'checkoutEnabled', 'orderCreated', 'notice'].includes(k)) || !uuid(r.id) || r.leadId !== leadId || !['INQUIRY', 'WAITING_ROUTE', 'TRANSFER_RESERVED', 'CANCEL_REQUESTED', 'CANCELLED', 'DELIVERED', 'DELIVERY_REQUIRES_REVIEW'].includes(r.state) || typeof r.available !== 'boolean' || typeof r.routeVerified !== 'boolean' || typeof r.delivered !== 'boolean' || r.checkoutEnabled !== false || r.orderCreated !== false || !/^[a-f0-9]{64}$/.test(r.transferHash) || !Array.isArray(r.events) || r.events.length > 200 || r.events.some((e: any) => !uuid(e.requestId) || !['ASK', 'CONSENT', 'CANCEL', 'SELLER_REPLY'].includes(e.action) || !Number.isFinite(Date.parse(e.at)) || (e.text !== undefined && (typeof e.text !== 'string' || e.text.length > 1500))))
    throw new Error('線索收件錯誤'); if (r.delivery !== null) {
    const d = obj(r.delivery);
    if (Object.keys(d).some(k => !['at', 'channel', 'verification'].includes(k)) || !Number.isFinite(Date.parse(d.at)) || !['FACEBOOK_UI', 'ECLAW', 'EMAIL'].includes(d.channel) || d.verification !== 'MANUAL_UI_RECEIPT')
        throw new Error('回執格式錯誤');
} return r as LeadRoom; }

export const sourceLocationLabel=(lead:Pick<SourceLead,'locationPrecision'>)=>lead.locationPrecision==='COUNTY_ILLUSTRATION'?'概略位置，非取貨點':'公共面交點';
