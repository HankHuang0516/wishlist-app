export type RetailPriceReference={price:number;priceType:'MANUFACTURER_MSRP'|'RETAIL_REGULAR';sourceUrl:string;sourceTitle:string;sourcePeriod:string|null;checkedAt:string};
export type RetailConversion={originalPrice:number;priceRatio:number;savingsPercent:number;pricePoints:number};
export type DiscoveryProduct = {
  kind:'listing'|'source'|'external'; id:string; key:string; title:string; description:string;
  mainId:string; subId:string; classificationMethod:string;
  price:number|null; priceText:string; currency:string|null; priceUnitVerified:boolean;
  thumbnailUrl:string|null; photos:{id:string;url:string;thumbnailUrl:string}[];
  county:string|null; district:string|null; condition:string; sourceLabel:string; stockStatus:string;
  canonicalUrl:string|null; detailPath:string; date:string; dateBasis:'PUBLISHED'|'SOURCE_POST_RANGE'|'COLLECTED'; dateEarliest:string|null;
  match?:{wishItemId:number;reasons:('NAME'|'BUDGET')[];score:number};
  cp?:{retail?:RetailPriceReference;conversion?:RetailConversion;score:number|null;confidence:string;reasons:{zh:string;en:string}[];limitations:{zh:string;en:string}[];basis:{key:string;hash:string}[];model:string;evaluatedAt:string;dimensions:{price:number;specification:number;condition:number;evidence:number}|null};
};
export type DiscoveryCategory={id:string;label:string;en:string;icon:string;count:number;children:{id:string;label:string;en:string;count:number;thumbnailUrl:string|null}[]};
export type DiscoveryPage={items:DiscoveryProduct[];categories:DiscoveryCategory[];nextCursor:string|null;snapshot:string;total:number;counts:{listing:number;source:number;external:number};counties:string[];complete:true;generatedAt:string;unknownPriceExcluded:boolean;cpStatus?:{evaluated:number;scored:number;pending:number;providerConfigured:boolean;threshold:number;assessments?:{retail?:RetailPriceReference;conversion?:RetailConversion;key:string;title:string;score:number|null;reasons:{zh:string;en:string}[];evaluatedAt:string}[]}};
export type DiscoveryFilters={q:string;main:string;sub:string;source:string;condition:string;county:string;min:string;max:string;sort:string;feed:string;display:string};
export const defaultDiscovery:DiscoveryFilters={q:'',main:'',sub:'',source:'all',condition:'',county:'',min:'',max:'',sort:'newest',feed:'latest',display:'grid'};
export function isLegacyExplore(search:string){const p=new URLSearchParams(search);return ['view','scope','bbox','wish','wishItemId','listing','external','brand','category','delivery','minPrice','maxPrice','radius'].some(k=>p.has(k))||p.has('source')&&!['all','listing','source','external'].includes(p.get('source')!);}
export function readDiscovery(search:string):DiscoveryFilters{
  const p=new URLSearchParams(search), r={...defaultDiscovery};
  for(const k of Object.keys(r) as (keyof DiscoveryFilters)[])if(p.has(k))r[k]=p.get(k)!;
  if(!['latest','for-you','cp'].includes(r.feed))r.feed='latest';
  if(!['grid','list'].includes(r.display))r.display='grid';
  if(!p.has('sort'))r.sort=r.feed==='for-you'?'recommended':r.feed==='cp'?'cp':'newest';
  if(!['newest','price-asc','price-desc','recommended','cp'].includes(r.sort)||r.sort==='recommended'&&r.feed!=='for-you'||r.sort==='cp'&&r.feed!=='cp')r.sort='newest';
  return r;
}
export function discoverySearch(f:DiscoveryFilters){const p=new URLSearchParams();for(const k of Object.keys(f) as (keyof DiscoveryFilters)[])if(f[k]&&f[k]!==defaultDiscovery[k])p.set(k,f[k]);return p;}
export function discoveryRequest(f:DiscoveryFilters,cursor=''){
  const p=discoverySearch(f);p.delete('display');p.delete('feed');
  if(cursor)p.set('cursor',cursor);return '/discovery'+(f.feed==='for-you'?'/for-you':f.feed==='cp'?'/cp':'')+'?'+p;
}
export function parseDiscovery(value:unknown):DiscoveryPage{
  const v=value as DiscoveryPage;
  if(!v||v.complete!==true||!Array.isArray(v.items)||!Array.isArray(v.categories)||!Array.isArray(v.counties)||!Number.isSafeInteger(v.total)||v.total<0||!v.counts||Object.values(v.counts).some(x=>!Number.isSafeInteger(x)||x<0)||v.items.some(p=>!['listing','source','external'].includes(p.kind)||typeof p.id!=='string'||p.key!==p.kind+':'+p.id||typeof p.title!=='string'||!Array.isArray(p.photos)||p.price!==null&&(!Number.isFinite(p.price)||p.price<0)))throw Error('Invalid discovery response');
  return v;
}
