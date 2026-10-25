import {parsePublicMapLocation,type PublicMapLocation} from './discoveryMapLayout';
export type RetailPriceReference={price:number;priceType:'MANUFACTURER_MSRP'|'RETAIL_REGULAR';sourceUrl:string;sourceTitle:string;sourceProductTitle?:string;sourcePeriod:string|null;checkedAt:string};
export type RetailConversion={originalPrice:number;priceRatio:number;savingsPercent:number;pricePoints:number};
export type DiscoveryProduct = {
  kind:'listing'|'source'|'external'; id:string; key:string; title:string; description:string;
  mainId:string; subId:string; classificationMethod:string;
  price:number|null; priceText:string; currency:string|null; priceUnitVerified:boolean;
  thumbnailUrl:string|null; photos:{id:string;url:string;thumbnailUrl:string}[];
  county:string|null; district:string|null; condition:string; sourceLabel:string; stockStatus:string;
  canonicalUrl:string|null; detailPath:string; date:string; dateBasis:'PUBLISHED'|'SOURCE_POST_RANGE'|'COLLECTED'; dateEarliest:string|null;
  match?:{wishItemId:number;reasons:('NAME'|'BUDGET')[];score:number};
  mapLocation?:PublicMapLocation|null;
  retail?:RetailPriceReference;
  cp?:{retail?:RetailPriceReference;conversion?:RetailConversion;score:number|null;confidence:string;reasons:{zh:string;en:string}[];limitations:{zh:string;en:string}[];basis:{key:string;hash:string}[];model:string;evaluatedAt:string;dimensions:{price:number;specification:number;condition:number;evidence:number}|null};
};
export type DiscoveryCategory={id:string;label:string;en:string;icon:string;count:number;children:{id:string;label:string;en:string;count:number;thumbnailUrl:string|null}[]};
export type DiscoveryPage={items:DiscoveryProduct[];categories:DiscoveryCategory[];nextCursor:string|null;snapshot:string;total:number;counts:{listing:number;source:number;external:number};counties:string[];complete:true;generatedAt:string;unknownPriceExcluded:boolean;mapTotals?:{located:number;unmapped:number};cpStatus?:{evaluated:number;scored:number;pending:number;providerConfigured:boolean;threshold:number;assessments?:{retail?:RetailPriceReference;conversion?:RetailConversion;key:string;title:string;score:number|null;reasons:{zh:string;en:string}[];evaluatedAt:string}[]}};
export type DiscoveryFilters={q:string;main:string;sub:string;source:string;condition:string;county:string;min:string;max:string;sort:string;feed:string;display:string;mode:'list'|'map'};
export const defaultDiscovery:DiscoveryFilters={q:'',main:'',sub:'',source:'all',condition:'',county:'',min:'',max:'',sort:'newest',feed:'latest',display:'grid',mode:'list'};
export function isLegacyExplore(search:string){const p=new URLSearchParams(search);return ['view','scope','bbox','wish','wishItemId','listing','external','brand','category','delivery','minPrice','maxPrice','radius'].some(k=>p.has(k))||p.has('source')&&!['all','listing','source','external'].includes(p.get('source')!);}
export function readDiscovery(search:string):DiscoveryFilters{
  const p=new URLSearchParams(search), r={...defaultDiscovery};
  for(const k of Object.keys(r) as (keyof DiscoveryFilters)[])if(p.has(k)){if(k==='mode')r.mode=p.get(k)==='map'?'map':'list';else r[k]=p.get(k)!;}
  if(!['latest','for-you','cp'].includes(r.feed))r.feed='latest';
  if(!['grid','list'].includes(r.display))r.display='grid';
  if(!['list','map'].includes(r.mode))r.mode='list';
  if(!p.has('sort'))r.sort=r.feed==='for-you'?'recommended':r.feed==='cp'?'cp':'newest';
  if(!['newest','price-asc','price-desc','recommended','cp'].includes(r.sort)||r.sort==='recommended'&&r.feed!=='for-you'||r.sort==='cp'&&r.feed!=='cp')r.sort='newest';
  return r;
}
export function discoverySearch(f:DiscoveryFilters){const p=new URLSearchParams();for(const k of Object.keys(f) as (keyof DiscoveryFilters)[])if(f[k]&&f[k]!==defaultDiscovery[k])p.set(k,f[k]);return p;}
export function discoveryRequest(f:DiscoveryFilters,cursor='',map?:{bbox?:[number,number,number,number]}){
  const p=discoverySearch(f);p.delete('display');p.delete('feed');
  p.delete('mode');if(map){p.set('presentation','map');p.set('limit','60');if(map.bbox)p.set('bbox',map.bbox.map(n=>Number(n.toFixed(8))).join(','));}
  if(cursor)p.set('cursor',cursor);return '/discovery'+(f.feed==='for-you'?'/for-you':f.feed==='cp'?'/cp':'')+'?'+p;
}
export function parseDiscovery(value:unknown,mapPresentation=false):DiscoveryPage{
  const v=value as DiscoveryPage;
  if(!v||v.complete!==true||!Array.isArray(v.items)||!Array.isArray(v.categories)||!Array.isArray(v.counties)||!Number.isSafeInteger(v.total)||v.total<0||!v.counts||Object.values(v.counts).some(x=>!Number.isSafeInteger(x)||x<0)||v.items.some(p=>!['listing','source','external'].includes(p.kind)||typeof p.id!=='string'||p.key!==p.kind+':'+p.id||typeof p.title!=='string'||!Array.isArray(p.photos)||p.price!==null&&(!Number.isFinite(p.price)||p.price<0)))throw Error('Invalid discovery response');
  if(mapPresentation||v.mapTotals!==undefined){
    const m=v.mapTotals;
    if(!m||!Number.isSafeInteger(m.located)||m.located<0||!Number.isSafeInteger(m.unmapped)||m.unmapped<0||m.located+m.unmapped!==v.total||
      Object.values(v.counts).reduce((n,c)=>n+c,0)!==v.total||new Set(v.items.map(p=>p.key)).size!==v.items.length||v.items.length>v.total)throw Error('Invalid map result counts');
    return {...v,items:v.items.map(p=>({...p,mapLocation:parsePublicMapLocation(p.mapLocation)}))};
  }
  return v;
}
