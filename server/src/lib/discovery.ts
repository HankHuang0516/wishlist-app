import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { publicListingSelect } from '../controllers/listingController';
import { NON_SALE_QA_PREFIX } from './listingRules';
import { leadCurrent, leadDTO } from './sourceLeadRules';
import { externalCandidateSelect, publicCandidate } from '../routes/externalListingRoutes';
import { classifyDiscovery, discoveryCatalog, sourcePrice, statedCondition } from './discoveryCatalog';
import { wishKeywords, normalizeWish } from './wishlistMatch';

export type DiscoveryProduct = {
  kind: 'listing' | 'source' | 'external'; id: string; key: string; title: string; description: string;
  mainId: string; subId: string; classificationMethod: string;
  price: number | null; priceText: string; currency: string | null; priceUnitVerified: boolean;
  thumbnailUrl: string | null; photos: { id: string; url: string; thumbnailUrl: string }[];
  county: string | null; district: string | null; condition: string; sourceLabel: string;
  stockStatus: string; canonicalUrl: string | null; detailPath: string;
  date: string; dateBasis: 'PUBLISHED' | 'SOURCE_POST_RANGE' | 'COLLECTED'; dateEarliest: string | null;
  match?: { wishItemId: number; reasons: ('NAME' | 'BUDGET')[]; score: number };
  cpAllowed?: boolean;
  cp?: {score:number|null;confidence:string;reasons:{zh:string;en:string}[];limitations:{zh:string;en:string}[];basis:{key:string;hash:string}[];model:string;evaluatedAt:string;dimensions:{price:number;specification:number;condition:number;evidence:number}|null};
};
export type DiscoveryQuery = { q: string; main: string; sub: string; source: string; condition: string; county: string; min?: number; max?: number; sort: string; cursor: string; limit: number };
export class DiscoveryError extends Error { constructor(public status: number, public code: string) { super(code); } }
export const discoveryHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function discoveryQuery(v: Record<string, unknown>): DiscoveryQuery {
  if (!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k => !['q','main','sub','source','condition','county','min','max','sort','cursor','limit'].includes(k)) || Object.values(v).some(x => typeof x !== 'string')) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  const q = String(v.q ?? '').trim(), main = String(v.main ?? ''), sub = String(v.sub ?? ''), source = String(v.source ?? 'all'), condition = String(v.condition ?? ''), county = String(v.county ?? ''), sort = String(v.sort ?? 'newest'), cursor = String(v.cursor ?? '');
  const group = discoveryCatalog.find(c => c.id === main);
  if (q.length > 80 || /[\u0000-\u001f\u007f]/.test(q) || main && !group || sub && !group?.children.some(s => s.id === sub) || !['all','listing','source','external'].includes(source) || !['','NEW','USED','UNKNOWN'].includes(condition) || county && !/^[\p{Script=Han}]{2,8}[市縣區鄉鎮里]$/u.test(county) || !['newest','price-asc','price-desc','recommended','cp'].includes(sort) || cursor.length > 600) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  const number = (key: string) => { if (v[key] === undefined || v[key] === '') return undefined; if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(v[key] as string)) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY'); return Number(v[key]); };
  const min = number('min'), max = number('max'), limit = v.limit === undefined ? 24 : Number(v.limit);
  if (min !== undefined && max !== undefined && min > max || !Number.isInteger(limit) || limit < 1 || limit > 60) throw new DiscoveryError(400,'INVALID_DISCOVERY_QUERY');
  return {q,main,sub,source,condition,county,min,max,sort,cursor,limit};
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
export async function loadDiscovery(now = new Date()) {
  const products: DiscoveryProduct[] = [];
  await prisma.$transaction(async tx => {
    const listings = await scan(cursor => tx.listing.findMany({where:{status:{in:['ACTIVE','RESERVED']},expiresAt:{gt:now},NOT:{title:{startsWith:NON_SALE_QA_PREFIX}}},select:publicListingSelect,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
    for (const r of listings) {
      const c = classifyDiscovery(r.title,r.category);
      products.push({kind:'listing',id:r.id,key:'listing:'+r.id,title:r.title,description:r.description??'',...c,classificationMethod:c.method,
        price:r.currency==='TWD'&&r.price!==null?Number(r.price):null,priceText:r.price?.toString()??'',currency:r.currency,priceUnitVerified:true,
        thumbnailUrl:r.media[0]?.thumbnailUrl??null,photos:r.media.map(m=>({id:m.id,url:m.imageUrl,thumbnailUrl:m.thumbnailUrl})),
        county:r.location?.county??null,district:r.location?.district??null,condition:r.condition,sourceLabel:'Wishlist',stockStatus:r.status,canonicalUrl:null,detailPath:'/listings/'+r.id,
        date:(r.publishedAt??r.createdAt).toISOString(),dateBasis:r.publishedAt?'PUBLISHED':'COLLECTED',dateEarliest:null});
    }
    if (process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1') {
      const leads = await scan(cursor=>tx.externalSourceLead.findMany({where:{status:'PUBLISHED'},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
      for (const r of leads) {
        if (!leadCurrent(r,now)) continue;
        const d=leadDTO(r,true,true), c=classifyDiscovery(r.title), p=sourcePrice(d.publicFacts);
        products.push({kind:'source',id:r.id,key:'source:'+r.id,title:r.title,description:r.summary,...c,classificationMethod:c.method,
          price:p.price,priceText:p.text,currency:p.currency,priceUnitVerified:p.unitVerified,thumbnailUrl:d.media?.[0]?.thumbnailUrl??null,
          photos:(d.media??[]).map(m=>({id:m.id,url:m.imageUrl,thumbnailUrl:m.thumbnailUrl})),county:r.county,district:r.district,
          condition:statedCondition(r.title),sourceLabel:new URL(r.canonicalUrl).hostname.replace(/^www\./,''),stockStatus:'UNKNOWN',canonicalUrl:r.canonicalUrl,
          detailPath:'/explore?view=source-leads&source='+r.id+'&presentation=1&photos=2&approximate=1&unlocated=1',
          date:(r.postedLatestAt??r.createdAt).toISOString(),dateBasis:r.postedLatestAt?'SOURCE_POST_RANGE':'COLLECTED',dateEarliest:r.postedEarliestAt?.toISOString()??null});
      }
    }
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED === '1') {
      const candidates = await scan(cursor=>tx.externalListingCandidate.findMany({where:{status:'APPROVED'},select:externalCandidateSelect,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})}));
      for (const row of candidates) {
        const d=publicCandidate(row,now); if(!d)continue; const c=classifyDiscovery(d.title);
        products.push({kind:'external',id:d.id,key:'external:'+d.id,title:d.title,description:d.description??'',...c,classificationMethod:c.method,
          price:d.priceTwd===undefined?null:Number(d.priceTwd),priceText:d.priceTwd??'',currency:'TWD',priceUnitVerified:true,thumbnailUrl:d.thumbnailUrl,
          photos:d.imageUrl?[{id:d.id,url:d.imageUrl,thumbnailUrl:d.thumbnailUrl??d.imageUrl}]:[],county:d.county,district:d.district,condition:d.condition,
          sourceLabel:d.source.host,stockStatus:'UNKNOWN',canonicalUrl:d.canonicalUrl,cpAllowed:row.source.aiProcessingAllowed,detailPath:'/explore?view=external&external='+d.id,
          date:d.observedAt.toISOString(),dateBasis:'COLLECTED',dateEarliest:null});
      }
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:20_000});
  return products;
}
export async function recommendDiscovery(products: DiscoveryProduct[], userId: number) {
  const wishes = await prisma.item.findMany({where:{wishlist:{userId},isPurchased:false},select:{id:true,name:true,maxPrice:true,priceCurrency:true},orderBy:{id:'desc'},take:500});
  return products.flatMap(p=>{
    let best: DiscoveryProduct['match'];
    for(const w of wishes){
      const words=wishKeywords(w.name), title=normalizeWish(p.title), found=words.filter(x=>title.includes(x));
      if(!words.length||found.length<Math.ceil(words.length/2)||words.filter(x=>!/[\p{Script=Han}]/u.test(x)).some(x=>!found.includes(x)))continue;
      const reasons: ('NAME'|'BUDGET')[]=['NAME']; let score=found.length/words.length*80;
      if(w.maxPrice!==null&&w.priceCurrency==='TWD') { if(p.price===null||p.currency!=='TWD'||p.price>Number(w.maxPrice))continue; reasons.push('BUDGET');score+=20; }
      if(!best||score>best.score)best={wishItemId:w.id,reasons,score};
    }
    return best?[{...p,match:best}]:[];
  });
}
export function filterDiscovery(all: DiscoveryProduct[], query: DiscoveryQuery,category=true) {
  const words=normalizeWish(query.q).split(' ').filter(Boolean);
  return all.filter(p=>(!category||(!query.main||p.mainId===query.main)&&(!query.sub||p.subId===query.sub))&&(query.source==='all'||p.kind===query.source)&&(!query.condition||p.condition===query.condition)&&(!query.county||p.county===query.county)&&words.every(w=>normalizeWish(p.title+' '+p.description).includes(w))&&(query.min===undefined||p.price!==null&&p.price>=query.min)&&(query.max===undefined||p.price!==null&&p.price<=query.max));
}
export function discoveryPage(all: DiscoveryProduct[], query: DiscoveryQuery) {
  const base=filterDiscovery(all,query,false);
  const categories=discoveryCatalog.map(c=>({...c,count:base.filter(p=>p.mainId===c.id).length,children:c.children.map(s=>({...s,count:base.filter(p=>p.mainId===c.id&&p.subId===s.id).length,thumbnailUrl:base.find(p=>p.mainId===c.id&&p.subId===s.id&&p.thumbnailUrl)?.thumbnailUrl??null}))}));
  const rows=base.filter(p=>(!query.main||p.mainId===query.main)&&(!query.sub||p.subId===query.sub));
  const newest=(a:DiscoveryProduct,b:DiscoveryProduct)=>Date.parse(b.date)-Date.parse(a.date)||a.key.localeCompare(b.key);
  rows.sort((a,b)=>query.sort.startsWith('price-')?(a.price===null?b.price===null?newest(a,b):1:b.price===null?-1:(query.sort==='price-asc'?a.price-b.price:b.price-a.price)||newest(a,b)):query.sort==='cp'?(b.cp?.score??0)-(a.cp?.score??0)||newest(a,b):query.sort==='recommended'?(b.match?.score??0)-(a.match?.score??0)||newest(a,b):newest(a,b));
  const signature=discoveryHash(rows), queryHash=discoveryHash({...query,cursor:'',limit:0});
  let start=0;
  if(query.cursor){try{const c=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(c.snapshot!==signature||c.query!==queryHash||typeof c.after!=='string')throw Error();start=rows.findIndex(r=>r.key===c.after)+1;if(!start)throw Error();}catch{throw new DiscoveryError(409,'DISCOVERY_RESULTS_CHANGED');}}
  const items=rows.slice(start,start+query.limit), more=start+items.length<rows.length;
  return {items,categories,nextCursor:more?Buffer.from(JSON.stringify({snapshot:signature,query:queryHash,after:items[items.length-1].key})).toString('base64url'):null,
    snapshot:signature,total:rows.length,counts:{listing:rows.filter(p=>p.kind==='listing').length,source:rows.filter(p=>p.kind==='source').length,external:rows.filter(p=>p.kind==='external').length},
    counties:[...new Set(all.map(p=>p.county).filter((v):v is string=>!!v))].sort(),complete:true,generatedAt:new Date().toISOString(),unknownPriceExcluded:query.min!==undefined||query.max!==undefined};
}
