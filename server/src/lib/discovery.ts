import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { publicListingSelect } from '../controllers/listingController';
import { NON_SALE_QA_PREFIX } from './listingRules';
import { privateReviewListingIds } from './privateReviewDemo';
import { leadCurrent, leadDTO } from './sourceLeadRules';
import { externalCandidateSelect, publicCandidate } from '../routes/externalListingRoutes';
import { classifyDiscovery, discoveryCatalog, sourcePrice, statedCondition } from './discoveryCatalog';
import { wishKeywords, normalizeWish } from './wishlistMatch';
import { privateStorePreviewProducts } from './privateStorePreview';

export type DiscoveryProduct = {
  kind: 'listing' | 'source' | 'external'; id: string; key: string; title: string; description: string;
  mainId: string; subId: string; classificationMethod: string;
  brand?: string | null;
  price: number | null; priceText: string; currency: string | null; priceUnitVerified: boolean;
  thumbnailUrl: string | null; photos: { id: string; url: string; thumbnailUrl: string }[];
  county: string | null; district: string | null; condition: string; sourceLabel: string;
  stockStatus: string; canonicalUrl: string | null; detailPath: string;
  date: string; dateBasis: 'PUBLISHED' | 'SOURCE_POST_RANGE' | 'COLLECTED'; dateEarliest: string | null;
  match?: { wishItemId: number; reasons: ('NAME' | 'BUDGET')[]; score: number };
  cpAllowed?: boolean;
  // Only populated for an explicit map presentation, using existing public coordinates.
  mapLocation?: {coordinates:[number,number];precision:'APPROXIMATE_2KM'|'COUNTY_ILLUSTRATION'|'PUBLIC_MEETING_POINT'|'DISTRICT_CENTER';visibleUntil?:string}|null;
  retail?: import('./retailPrices').RetailReference;
  cp?: {retail?:import('./retailPrices').RetailReference;conversion?:{originalPrice:number;priceRatio:number;savingsPercent:number;pricePoints:number};score:number|null;confidence:string;reasons:{zh:string;en:string}[];limitations:{zh:string;en:string}[];basis:{key:string;hash:string}[];model:string;evaluatedAt:string;dimensions:{price:number;specification:number;condition:number;evidence:number}|null};
};
export type DiscoveryQuery = { q: string; main: string; sub: string; source: string; condition: string; county: string; min?: number; max?: number; sort: string; cursor: string; limit: number;presentation?:'map';bbox?:[number,number,number,number] };
export class DiscoveryError extends Error { constructor(public status: number, public code: string) { super(code); } }
export const discoveryHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function discoveryQuery(v: Record<string, unknown>): DiscoveryQuery {
  if (!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k => !['q','main','sub','source','condition','county','min','max','sort','cursor','limit','presentation','bbox'].includes(k)) || Object.values(v).some(x => typeof x !== 'string')) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  const q = String(v.q ?? '').trim(), main = String(v.main ?? ''), sub = String(v.sub ?? ''), source = String(v.source ?? 'all'), condition = String(v.condition ?? ''), county = String(v.county ?? ''), sort = String(v.sort ?? 'newest'), cursor = String(v.cursor ?? '');
  const group = discoveryCatalog.find(c => c.id === main);
  if (q.length > 80 || /[\u0000-\u001f\u007f]/.test(q) || main && !group || sub && !group?.children.some(s => s.id === sub) || !['all','listing','source','external'].includes(source) || !['','NEW','USED','UNKNOWN'].includes(condition) || county && !/^[\p{Script=Han}]{2,8}[市縣區鄉鎮里]$/u.test(county) || !['newest','price-asc','price-desc','recommended','cp'].includes(sort) || cursor.length > 600) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  const number = (key: string) => { if (v[key] === undefined || v[key] === '') return undefined; if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(v[key] as string)) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY'); return Number(v[key]); };
  const min = number('min'), max = number('max'), limit = v.limit === undefined ? 24 : Number(v.limit);
  if (min !== undefined && max !== undefined && min > max || !Number.isInteger(limit) || limit < 1 || limit > 60) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  if(v.presentation!==undefined&&v.presentation!=='map'||v.bbox!==undefined&&v.presentation!=='map')throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  let bbox:DiscoveryQuery['bbox'];
  if(v.bbox!==undefined){
    const parts=String(v.bbox).split(',');
    const values=parts.map(Number);
    if(parts.length!==4||parts.some(p=>! /^-?\d{1,3}(?:\.\d{1,8})?$/.test(p))||values.some(n=>!Number.isFinite(n))||
       values[0]<-180||values[2]>180||values[1]<-85||values[3]>85||values[0]>=values[2]||values[1]>=values[3])throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
    bbox=values as DiscoveryQuery['bbox'];
  }
  return {q,main,sub,source,condition,county,min,max,sort,cursor,limit,...(v.presentation==='map'?{presentation:'map' as const,bbox}:{})};
}

// Scan every eligible public row, in bounded batches. Filtering never happens
// only on a first page of source references. A failed scan is an error, not 0.
async function scan<T extends {id: string}>(read: (cursor?: string) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []; let cursor: string | undefined;
  for (;;) {
    const batch = await read(cursor); rows.push(...batch);
    if (batch.length < 500) return rows;
    if (rows.length >= 20_000) throw new DiscoveryError(503,'DISCOVERY_SCAN_CAPACITY');
    const next = batch[batch.length-1].id;
    if (next === cursor) throw new DiscoveryError(503,'DISCOVERY_SCAN_INCOMPLETE');
    cursor = next;
  }
}
// One public product per source row. The full scan below and the read model in
// publicCatalog.ts both build products here, so the two cannot drift apart.
export type DiscoveryListingRow = Prisma.ListingGetPayload<{select: typeof publicListingSelect}>;
export type DiscoveryCandidateRow = Prisma.ExternalListingCandidateGetPayload<{select: typeof externalCandidateSelect}>;
export const discoveryListingWhere = (now: Date): Prisma.ListingWhereInput => ({status:{in:['ACTIVE','RESERVED']},expiresAt:{gt:now},NOT:{title:{startsWith:NON_SALE_QA_PREFIX}}});
export function listingProduct(r: DiscoveryListingRow, now: Date, mapPresentation: boolean): DiscoveryProduct {
  const c = classifyDiscovery(r.title,r.category);
  return {kind:'listing',id:r.id,key:'listing:'+r.id,title:r.title,description:r.description??'',...c,classificationMethod:c.method,
    brand:r.brand,price:r.currency==='TWD'&&r.price!==null?Number(r.price):null,priceText:r.price?.toString()??'',currency:r.currency,priceUnitVerified:true,
    thumbnailUrl:r.media[0]?.thumbnailUrl??null,photos:r.media.map(m=>({id:m.id,url:m.imageUrl,thumbnailUrl:m.thumbnailUrl})),
    county:r.location?.county??null,district:r.location?.district??null,condition:r.condition,sourceLabel:'Wishlist',stockStatus:r.status,canonicalUrl:null,detailPath:'/listings/'+r.id,
    date:(r.publishedAt??r.createdAt).toISOString(),dateBasis:r.publishedAt?'PUBLISHED':'COLLECTED',dateEarliest:null,
    ...(mapPresentation?{mapLocation:r.location&&r.mapVisibleUntil&&r.mapVisibleUntil>now?{coordinates:[r.location.publicLongitude,r.location.publicLatitude] as [number,number],precision:'APPROXIMATE_2KM' as const,visibleUntil:r.mapVisibleUntil.toISOString()}:null}:{})};
}
export function leadProduct(r: Parameters<typeof leadCurrent>[0], now: Date, mapPresentation: boolean): DiscoveryProduct | null {
  if (!leadCurrent(r,now)) return null;
  const d=leadDTO(r,true,true), c=classifyDiscovery(r.title), p=sourcePrice(d.publicFacts);
  return {kind:'source',id:r.id,key:'source:'+r.id,title:r.title,description:r.summary,...c,classificationMethod:c.method,
    price:p.price,priceText:p.text,currency:p.currency,priceUnitVerified:p.unitVerified,thumbnailUrl:d.media?.[0]?.thumbnailUrl??null,
    photos:(d.media??[]).map(m=>({id:m.id,url:m.imageUrl,thumbnailUrl:m.thumbnailUrl})),county:r.county,district:r.district,
    condition:statedCondition(r.title),sourceLabel:new URL(r.canonicalUrl).hostname.replace(/^www\./,''),stockStatus:'UNKNOWN',canonicalUrl:r.canonicalUrl,
    detailPath:'/explore?view=source-leads&source='+r.id+'&presentation=1&photos=2&approximate=1&unlocated=1',
    date:d.firstObservedAt??(r.postedLatestAt??r.createdAt).toISOString(),dateBasis:r.postedLatestAt?'SOURCE_POST_RANGE':'COLLECTED',dateEarliest:r.postedEarliestAt?.toISOString()??null,
    ...(mapPresentation?{mapLocation:d.locationPrecision!=='CONTACT_FOR_LOCATION'&&d.longitude!==null&&d.latitude!==null?{coordinates:[d.longitude,d.latitude] as [number,number],precision:d.locationPrecision==='COUNTY_ILLUSTRATION'?'COUNTY_ILLUSTRATION' as const:'PUBLIC_MEETING_POINT' as const}:null}:{})};
}
export function candidateProduct(row: DiscoveryCandidateRow, now: Date, mapPresentation: boolean): DiscoveryProduct | null {
  const d=publicCandidate(row,now); if(!d)return null; const c=classifyDiscovery(d.title);
  return {kind:'external',id:d.id,key:'external:'+d.id,title:d.title,description:d.description??'',...c,classificationMethod:c.method,
    price:d.priceTwd===undefined?null:Number(d.priceTwd),priceText:d.priceTwd??'',currency:'TWD',priceUnitVerified:true,thumbnailUrl:d.thumbnailUrl,
    photos:d.imageUrl?[{id:d.id,url:d.imageUrl,thumbnailUrl:d.thumbnailUrl??d.imageUrl}]:[],county:d.county,district:d.district,condition:d.condition,
    sourceLabel:d.source.host,stockStatus:'UNKNOWN',canonicalUrl:d.canonicalUrl,cpAllowed:row.source.aiProcessingAllowed,detailPath:'/explore?view=external&external='+d.id,
    date:d.observedAt.toISOString(),dateBasis:'COLLECTED',dateEarliest:null,
    ...(mapPresentation?{mapLocation:{coordinates:[d.location.longitude,d.location.latitude] as [number,number],precision:'DISTRICT_CENTER' as const}}:{})};
}
// Every public product, for the callers that need the whole set (matching, price
// comparison, admin tools). Served from the read model when it is ready; the full
// scan remains the reference and the fallback.
// `declined`: the caller has just asked the read model itself (and looked for a
// private preview) and was refused, so the full scan is used without asking again.
export async function loadDiscovery(now = new Date(), mapPresentation=false, viewerId?: number, declined=false) {
  if (!declined) {
    const privatePreview = await privateStorePreviewProducts(viewerId, now, mapPresentation);
    if (privatePreview !== null) return privatePreview;
    const catalog = await import('./publicCatalog');
    if (await catalog.catalogReady(now)) return catalog.catalogProducts(now, mapPresentation, true);
  }
  return scanDiscovery(now, mapPresentation);
}
export async function scanDiscovery(now = new Date(), mapPresentation=false) {
  const products: DiscoveryProduct[] = [];
  await prisma.$transaction(async tx => {
    const listings = await scan(cursor => tx.listing.findMany({where:{id:{notIn:privateReviewListingIds()},...discoveryListingWhere(now)},select:publicListingSelect,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
    for (const r of listings) products.push(listingProduct(r,now,mapPresentation));
    if (process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1') {
      const leads = await scan(cursor=>tx.externalSourceLead.findMany({where:{status:'PUBLISHED'},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
      for (const r of leads) { const product=leadProduct(r,now,mapPresentation); if(product)products.push(product); }
    }
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED === '1') {
      const candidates = await scan(cursor=>tx.externalListingCandidate.findMany({where:{status:'APPROVED'},select:externalCandidateSelect,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
      for (const row of candidates) { const product=candidateProduct(row,now,mapPresentation); if(product)products.push(product); }
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20_000});
  return products;
}
type WishInput = { id: number; name: string; maxPrice: Prisma.Decimal | number | null; priceCurrency: string | null };
type WishRule = { id: number; words: string[]; latin: string[]; budget: number | null };
// A wish's keywords and budget, worked out once instead of once per product.
const wishRule = (w: WishInput): WishRule => {
  const words = wishKeywords(w.name);
  return { id: w.id, words, latin: words.filter(x => !/[\p{Script=Han}]/u.test(x)), budget: w.maxPrice !== null && w.priceCurrency === 'TWD' ? Number(w.maxPrice) : null };
};
/** How a product (with its title already normalized) matches one wish, or null: at least half of the wish's
 *  keywords, every Latin or number keyword, and within a budget given in TWD. The rule of 你會想要. */
function wishMatch(p: DiscoveryProduct, title: string, rule: WishRule): DiscoveryProduct['match'] | null {
  const found = rule.words.filter(x => title.includes(x));
  if (!rule.words.length || found.length < Math.ceil(rule.words.length / 2) || rule.latin.some(x => !found.includes(x))) return null;
  const reasons: ('NAME' | 'BUDGET')[] = ['NAME']; let score = found.length / rule.words.length * 80;
  if (rule.budget !== null) { if (p.price === null || p.currency !== 'TWD' || p.price > rule.budget) return null; reasons.push('BUDGET'); score += 20; }
  return { wishItemId: rule.id, reasons, score };
}
export async function recommendDiscovery(products: DiscoveryProduct[], userId: number, wishItemId?: number) {
  const wishes = await prisma.item.findMany({where:{wishlist:{userId},isPurchased:false,isHidden:false,...(wishItemId===undefined?{}:{id:wishItemId})},select:{id:true,name:true,maxPrice:true,priceCurrency:true},orderBy:{id:'desc'},take:500});
  if(wishItemId!==undefined&&!wishes.length)throw new DiscoveryError(404,'DISCOVERY_WISH_UNAVAILABLE');
  const rules = wishes.map(wishRule);
  return products.flatMap(p=>{
    let best: DiscoveryProduct['match'];
    const title = normalizeWish(p.title);
    for (const rule of rules) { const match = wishMatch(p, title, rule); if (match && (!best || match.score > best.score)) best = match; }
    return best?[{...p,match:best}]:[];
  });
}

// ---- every wish against every public product, for the signed-in home page ----
export const WISH_MATCH_WISHES = 50, WISH_MATCH_ITEMS = 12;
const newestFirst = (a: DiscoveryProduct, b: DiscoveryProduct) => Date.parse(b.date) - Date.parse(a.date) || a.key.localeCompare(b.key);
/** Each of the account's open wishes (newest first, the ones 你會想要 matches) with the products that match it by the
 *  same rule, best first: what the home page shows without anyone choosing a wish. Only candidates are read: the
 *  products whose text holds one of the wishes' keywords. The account's own listings are left out. */
export async function wishMatchGroups(userId: number, now = new Date()) {
  const wishes = await prisma.item.findMany({ where: { wishlist: { userId }, isPurchased: false, isHidden: false },
    select: { id: true, name: true, maxPrice: true, priceCurrency: true, wishlist: { select: { id: true, title: true } } }, orderBy: { id: 'desc' }, take: WISH_MATCH_WISHES });
  const rules = wishes.map(wishRule), words = [...new Set(rules.flatMap(rule => rule.words))];
  let products: DiscoveryProduct[] = [];
  if (words.length) {
    const preview = await privateStorePreviewProducts(userId, now, false);
    const catalog = preview === null ? await import('./publicCatalog') : null;
    products = preview ?? (await catalog!.catalogReady(now) ? await catalog!.catalogProductsMatching(now, words) : await loadDiscovery(now, false, userId, true));
    const own = new Set((await prisma.listing.findMany({ where: { ownerUserId: userId }, select: { id: true } })).map(row => 'listing:' + row.id));
    products = products.filter(p => !own.has(p.key));
  }
  const titles = new Map(products.map(p => [p.key, normalizeWish(p.title)]));
  return { complete: true as const, generatedAt: now.toISOString(), groups: wishes.map((w, index) => {
    const matched = products.flatMap(p => { const match = wishMatch(p, titles.get(p.key)!, rules[index]); return match ? [{ ...p, match }] : []; })
      .sort((a, b) => b.match!.score - a.match!.score || newestFirst(a, b));
    return { wish: { id: w.id, name: w.name, maxPrice: w.maxPrice === null ? null : Number(w.maxPrice), priceCurrency: w.priceCurrency, wishlist: w.wishlist },
      total: matched.length, items: matched.slice(0, WISH_MATCH_ITEMS) };
  }) };
}
export function filterDiscovery(all: DiscoveryProduct[], query: DiscoveryQuery,category=true) {
  const words=normalizeWish(query.q).split(' ').filter(Boolean);
  return all.filter(p=>(!category||(!query.main||p.mainId===query.main)&&(!query.sub||p.subId===query.sub))&&(query.source==='all'||p.kind===query.source)&&(!query.condition||p.condition===query.condition)&&(!query.county||p.county===query.county)&&words.every(w=>normalizeWish(p.title+' '+p.description+' '+(p.brand??'')).includes(w))&&(query.min===undefined||p.price!==null&&p.price>=query.min)&&(query.max===undefined||p.price!==null&&p.price<=query.max)&&(!query.bbox||!p.mapLocation||p.mapLocation.coordinates[0]>=query.bbox[0]&&p.mapLocation.coordinates[0]<=query.bbox[2]&&p.mapLocation.coordinates[1]>=query.bbox[1]&&p.mapLocation.coordinates[1]<=query.bbox[3]));
}
export function discoveryPage(all: DiscoveryProduct[], query: DiscoveryQuery) {
  const base=filterDiscovery(all,query,false);
  const categories=discoveryCatalog.map(c=>({...c,count:base.filter(p=>p.mainId===c.id).length,children:c.children.map(s=>({...s,count:base.filter(p=>p.mainId===c.id&&p.subId===s.id).length,thumbnailUrl:base.find(p=>p.mainId===c.id&&p.subId===s.id&&p.thumbnailUrl)?.thumbnailUrl??null}))}));
  const rows=base.filter(p=>(!query.main||p.mainId===query.main)&&(!query.sub||p.subId===query.sub));
  const newest=(a:DiscoveryProduct,b:DiscoveryProduct)=>Date.parse(b.date)-Date.parse(a.date)||a.key.localeCompare(b.key);
  rows.sort((a,b)=>query.presentation==='map'&&!!a.mapLocation!==!!b.mapLocation?(a.mapLocation?-1:1):query.sort.startsWith('price-')?(a.price===null?b.price===null?newest(a,b):1:b.price===null?-1:(query.sort==='price-asc'?a.price-b.price:b.price-a.price)||newest(a,b)):query.sort==='cp'?(b.cp?.score??0)-(a.cp?.score??0)||newest(a,b):query.sort==='recommended'?(b.match?.score??0)-(a.match?.score??0)||newest(a,b):newest(a,b));
  const signature=discoveryHash(rows), queryHash=discoveryHash({...query,cursor:'',limit:0});
  let start=0;
  if(query.cursor){try{const c=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(c.snapshot!==signature||c.query!==queryHash||typeof c.after!=='string')throw Error();start=rows.findIndex(r=>r.key===c.after)+1;if(!start)throw Error();}catch{throw new DiscoveryError(409,'DISCOVERY_RESULTS_CHANGED');}}
  const items=rows.slice(start,start+query.limit), more=start+items.length<rows.length;
  return {items,categories,nextCursor:more?Buffer.from(JSON.stringify({snapshot:signature,query:queryHash,after:items[items.length-1].key})).toString('base64url'):null,
    snapshot:signature,total:rows.length,counts:{listing:rows.filter(p=>p.kind==='listing').length,source:rows.filter(p=>p.kind==='source').length,external:rows.filter(p=>p.kind==='external').length},
    counties:[...new Set(all.map(p=>p.county).filter((v):v is string=>!!v))].sort(),complete:true,generatedAt:new Date().toISOString(),unknownPriceExcluded:query.min!==undefined||query.max!==undefined,
    ...(query.presentation==='map'?{mapTotals:{located:rows.filter(p=>!!p.mapLocation).length,unmapped:rows.filter(p=>!p.mapLocation).length},geographicScope:query.bbox??null}:{})};
}
