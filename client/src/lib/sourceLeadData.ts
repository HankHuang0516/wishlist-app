import { isUuid as uuid } from './listingBatch';
import { TAIWAN_DISTRICTS } from './taiwanAdministrativeDistricts';
export type LeadPhoto = { id: string; sourceUrl: string; imageUrl: string; thumbnailUrl: string; alt: string };
export type ContactRouting={status:'VERIFIED'|'UNAVAILABLE'|'UNVERIFIED';reason:string;checkedAt:string|null};
export function parseContactRouting(value:unknown):ContactRouting {
 const c=obj(value);if(Object.keys(c).some(k=>!['status','reason','checkedAt'].includes(k))||!['VERIFIED','UNAVAILABLE','UNVERIFIED'].includes(c.status)||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>240||!(c.checkedAt===null||typeof c.checkedAt==='string'&&Number.isFinite(Date.parse(c.checkedAt))))throw new Error('來源聯絡狀態錯誤');return c as ContactRouting;
}
export type PhotoCompleteness={status:'UNVERIFIED'|'INCOMPLETE'|'IMPORTED_COMPLETE'|'STALE'|'OVER_LIMIT';sourceCount:number|null;physicalSourceCount:number|null;importedCount:number;limit:number};
export type ActiveAuctionWindow={startsAt:string;endsAt:string;timeZone:'Asia/Taipei'};
export type SourceDateBasis=
 | {sourceType?:never;dateBasis?:never;originalPublishedAt?:never;priceType?:never;activeAuctionWindow?:never;postedEarliestAt:string;postedLatestAt:string}
 | {sourceType:'OFFICIAL_AUCTION';dateBasis:'ACTIVE_AUCTION_WINDOW';originalPublishedAt:null;priceType:'STARTING_BID';activeAuctionWindow:ActiveAuctionWindow;postedEarliestAt:null;postedLatestAt:null};
export type SourceLead = SourceDateBasis & {
    photoCompleteness?:PhotoCompleteness;
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
export function parseLead(v: unknown): SourceLead { const r = obj(v); const keys = ['id', 'kind', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'postedEarliestAt', 'postedLatestAt', 'checkedAt', 'stockStatus', 'qualifiedSupply', 'checkoutEnabled', 'notice', 'publicFacts', 'coordinateSourceUrl', 'coordinateAttribution', 'media','photoCompleteness','contactRouting','locationPrecision','sourceType','dateBasis','originalPublishedAt','priceType','activeAuctionWindow']; if (Object.keys(r).some(k => !keys.includes(k)) || !uuid(r.id) || r.kind !== 'SOURCE_LEAD' || r.stockStatus !== 'UNKNOWN' || r.qualifiedSupply !== false || r.checkoutEnabled !== false || (!TAIWAN_DISTRICTS[r.county]?.has(r.district)&&!(r.locationPrecision==='COUNTY_ILLUSTRATION'&&r.county==='臺北市'&&r.district==='行政區未明示')) || ['title', 'summary', 'publicPlaceName', 'publicAddress', 'notice'].some(k => typeof r[k] !== 'string' || !r[k].trim()) || r.title.length > 100 || r.summary.length > 240 || typeof r.latitude !== 'number' || r.latitude < 20 || r.latitude > 26.6 || typeof r.longitude !== 'number' || r.longitude < 117 || r.longitude > 123.8 || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude))
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
 if (!Array.isArray(r.media) || r.media.length > 32 || new Set(r.media.map((m:any)=>m.id)).size !== r.media.length) throw new Error('來源圖片映射錯誤');
 for (const m of r.media) {
  if (!m || Object.keys(m).some(k=>!['id','sourceUrl','imageUrl','thumbnailUrl','alt'].includes(k)) || !uuid(m.id) || m.sourceUrl !== r.canonicalUrl || typeof m.alt !== 'string' || !m.alt.trim() || m.alt.length > 100) throw new Error('來源圖片映射錯誤');
  const image = new URL(m.imageUrl), thumbnail = new URL(m.thumbnailUrl);
  if (image.protocol !== 'https:' || image.username || image.password || image.port || image.search || image.hash || thumbnail.origin !== image.origin || thumbnail.search || thumbnail.hash || thumbnail.username || thumbnail.password || image.pathname !== '/api/source-leads/'+r.id+'/media/'+m.id+'/image' || thumbnail.pathname !== '/api/source-leads/'+r.id+'/media/'+m.id+'/thumbnail') throw new Error('來源圖片路由錯誤');
 }
} if(r.photoCompleteness!==undefined){const c=obj(r.photoCompleteness);if(Object.keys(c).some(k=>!['status','sourceCount','physicalSourceCount','importedCount','limit'].includes(k))||!['UNVERIFIED','INCOMPLETE','IMPORTED_COMPLETE','STALE','OVER_LIMIT'].includes(c.status)||c.limit!==32||!(c.sourceCount===null||Number.isSafeInteger(c.sourceCount)&&c.sourceCount>=0&&c.sourceCount<=500)||!(c.physicalSourceCount===null||Number.isSafeInteger(c.physicalSourceCount)&&c.physicalSourceCount>=0&&c.sourceCount!==null&&c.physicalSourceCount<=c.sourceCount)||!Number.isSafeInteger(c.importedCount)||c.importedCount!==(r.media??[]).length||(c.status==='IMPORTED_COMPLETE'&&(c.sourceCount===0||c.sourceCount!==c.importedCount))||(c.status==='OVER_LIMIT'&&!(c.sourceCount>c.limit)))throw new Error('來源圖片完整性格式錯誤');} if(r.contactRouting!==undefined)parseContactRouting(r.contactRouting); if(r.sourceType==='OFFICIAL_AUCTION'&&(!r.publicFacts||typeof r.publicFacts.priceText!=='string'||!r.publicFacts.priceText.startsWith('起標價')||typeof r.publicFacts.originalDateLabel!=='string'||!r.publicFacts.originalDateLabel.includes('原刊日未知')))throw new Error('拍賣日期與價格說明缺漏');
    if (!sourceLeadFresh(r as SourceLead)) throw new Error('線索日期失效'); return r as SourceLead; }
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
        reservationId?:string;
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
export function parseLeadRoom(v: unknown, leadId: string): LeadRoom { const r = obj(v); if (Object.keys(r).some(k => !['id', 'leadId', 'state', 'available', 'events', 'transferHash', 'routeVerified', 'delivered', 'delivery', 'checkoutEnabled', 'orderCreated', 'notice'].includes(k)) || !uuid(r.id) || r.leadId !== leadId || !['INQUIRY', 'WAITING_ROUTE', 'TRANSFER_RESERVED', 'CANCEL_REQUESTED', 'CANCELLED', 'DELIVERED', 'DELIVERY_REQUIRES_REVIEW'].includes(r.state) || typeof r.available !== 'boolean' || typeof r.routeVerified !== 'boolean' || typeof r.delivered !== 'boolean' || r.checkoutEnabled !== false || r.orderCreated !== false || !/^[a-f0-9]{64}$/.test(r.transferHash) || !Array.isArray(r.events) || r.events.length > 201 || r.events.length===201&&r.events[200]?.action!=='CANCEL' || r.events.some((e: any) => e.reservationId!==undefined&&!uuid(e.reservationId) || !uuid(e.requestId) || !['ASK', 'CONSENT', 'CANCEL', 'SELLER_REPLY'].includes(e.action) || !Number.isFinite(Date.parse(e.at)) || (e.text !== undefined && (typeof e.text !== 'string' || e.text.length > 1500))))
    throw new Error('線索收件錯誤'); if (r.delivery !== null) {
    const d = obj(r.delivery);
    if (Object.keys(d).some(k => !['at', 'channel', 'verification'].includes(k)) || !Number.isFinite(Date.parse(d.at)) || !['FACEBOOK_UI', 'ECLAW', 'EMAIL'].includes(d.channel) || d.verification !== 'MANUAL_UI_RECEIPT')
        throw new Error('回執格式錯誤');
} return r as LeadRoom; }

export const sourceLocationLabel=(lead:Pick<SourceLead,'locationPrecision'|'sourceType'>)=>lead.locationPrecision==='COUNTY_ILLUSTRATION'?'概略位置，非取貨點':lead.sourceType==='OFFICIAL_AUCTION'?'官方公開取貨點':'公共面交點';

export function sourceLeadFresh(r:Pick<SourceLead,'canonicalUrl'|'postedEarliestAt'|'postedLatestAt'|'checkedAt'|'sourceType'|'dateBasis'|'originalPublishedAt'|'priceType'|'activeAuctionWindow'>,now=Date.now()){
 const checked=Date.parse(r.checkedAt);if(!Number.isFinite(checked)||checked>now||now-checked>48*3600000)return false;
 if(r.sourceType!==undefined){
  const w=r.activeAuctionWindow;let u:URL;try{u=new URL(r.canonicalUrl);}catch{return false;}
  if(r.sourceType!=='OFFICIAL_AUCTION'||r.dateBasis!=='ACTIVE_AUCTION_WINDOW'||r.originalPublishedAt!==null||r.priceType!=='STARTING_BID'||r.postedEarliestAt!==null||r.postedLatestAt!==null||
   u.protocol!=='https:'||u.username!==''||u.password!==''||u.search!==''||u.hash!==''||u.port!==''||u.hostname!=='recycledstuff.ntpc.gov.tw'||!/^\/Product\/Detail\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(u.pathname)||
   !w||Object.keys(w).some(k=>!['startsAt','endsAt','timeZone'].includes(k))||w.timeZone!=='Asia/Taipei')return false;
  if(typeof w.startsAt!=='string'||typeof w.endsAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(w.startsAt)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(w.endsAt))return false;
  const start=Date.parse(w.startsAt),end=Date.parse(w.endsAt);
  const normalized=(s:string)=>s.replace(/(?:\.(\d{1,3}))?Z$/,(_m,digits:string|undefined)=>'.'+(digits??'').padEnd(3,'0')+'Z');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(r.checkedAt)&&new Date(checked).toISOString()===normalized(r.checkedAt)&&Number.isFinite(start)&&Number.isFinite(end)&&new Date(start).toISOString()===normalized(w.startsAt)&&new Date(end).toISOString()===normalized(w.endsAt)&&start<=checked&&start<=now&&now<end&&start<end;
 }
 if(r.dateBasis!==undefined||r.originalPublishedAt!==undefined||r.priceType!==undefined||r.activeAuctionWindow!==undefined||typeof r.postedEarliestAt!=='string'||typeof r.postedLatestAt!=='string')return false;
 const lower=Date.parse(r.postedEarliestAt),upper=Date.parse(r.postedLatestAt);
 return Number.isFinite(lower)&&Number.isFinite(upper)&&lower>=sourceLeadCutoff(now)&&lower<=upper&&upper<=now;
}
export function sourceDateLabel(r:SourceLead){
 return r.sourceType==='OFFICIAL_AUCTION'
  ? '原刊日未知；有效拍賣期間：'+new Date(r.activeAuctionWindow!.startsAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'～'+new Date(r.activeAuctionWindow!.endsAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'（台灣時間）。起標價非成交價。'
  : '原始發布日期區間：'+new Date(r.postedEarliestAt!).toLocaleDateString('zh-TW')+'～'+new Date(r.postedLatestAt!).toLocaleDateString('zh-TW');
}
