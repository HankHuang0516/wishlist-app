import {validateApiUrl} from './api';
import {uuid} from './listingForm';
import {parseRetailReference,type RetailReference} from './retailReference';
import {parsePublicMapLocation,type PublicMapLocation} from './discoveryMapLayout';

export type DiscoveryProduct={kind:'listing'|'source'|'external';id:string;key:string;title:string;description:string;mainId:string;subId:string;price:number|null;priceText:string;currency:string|null;priceUnitVerified:boolean;thumbnailUrl:string|null;photos:{id:string;url:string;thumbnailUrl:string}[];county:string|null;district:string|null;condition:string;sourceLabel:string;stockStatus:string;date:string;dateBasis:'PUBLISHED'|'SOURCE_POST_RANGE'|'COLLECTED';dateEarliest:string|null;mapLocation?:PublicMapLocation|null;match?:{wishItemId:number;score:number;reasons:string[]};cp?:{score:number|null;confidence:string;retail?:RetailReference};retail?:RetailReference};
export type DiscoveryCategory={id:string;label:string;count:number;children:{id:string;label:string;count:number}[]};
export type DiscoveryPage={items:DiscoveryProduct[];categories:DiscoveryCategory[];counties:string[];nextCursor:string|null;snapshot:string;total:number;counts:{listing:number;source:number;external:number};complete:true;generatedAt:string;unknownPriceExcluded:boolean;mapTotals?:{located:number;unmapped:number}};
export type DiscoveryFilters={q:string;main:string;sub:string;county:string;condition:string;source:'all'|'listing'|'source'|'external';min:string;max:string;sort:'newest'|'price-asc'|'price-desc'|'recommended'|'cp';feed:'latest'|'for-you'|'cp'};
export const defaultDiscovery:DiscoveryFilters={q:'',main:'',sub:'',county:'',condition:'',source:'all',min:'',max:'',sort:'newest',feed:'latest'};
export class DiscoveryDataError extends Error{}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new DiscoveryDataError();return v as Record<string,unknown>;};
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new DiscoveryDataError();return v;};
const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new DiscoveryDataError();return v;};
const slug=(v:unknown)=>{const s=text(v,64);if(!/^[a-z0-9-]+$/.test(s))throw new DiscoveryDataError();return s;};
const date=(v:unknown)=>{const s=text(v,64);if(!Number.isFinite(Date.parse(s)))throw new DiscoveryDataError();return s;};
function mediaUrl(v:unknown,apiUrl:string,allowLocal:boolean):string{
 const raw=text(v,4096);const base=new URL(validateApiUrl(apiUrl,allowLocal));const u=new URL(raw,base.origin);
 if(!raw||raw.startsWith('//')||u.username||u.password||u.protocol!=='https:'&&!(u.origin===base.origin&&base.protocol==='http:'&&u.protocol==='http:'))throw new DiscoveryDataError();
 return u.href;
}
export function parseNativeDiscovery(value:unknown,apiUrl:string,allowLocal=false,mapPresentation=false):DiscoveryPage{
 const v=object(value);if(v.complete!==true||!Array.isArray(v.items)||v.items.length>60||!Array.isArray(v.categories)||v.categories.length>32||!Array.isArray(v.counties)||v.counties.length>100||typeof v.unknownPriceExcluded!=='boolean')throw new DiscoveryDataError();
 const items=v.items.map(raw=>{
  const p=object(raw);if(!['listing','source','external'].includes(p.kind as string)||!uuid(p.id)||p.key!==p.kind+':'+p.id||!Array.isArray(p.photos)||p.photos.length>32||typeof p.priceUnitVerified!=='boolean'||p.price!==null&&(typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<0)||!['PUBLISHED','SOURCE_POST_RANGE','COLLECTED'].includes(p.dateBasis as string))throw new DiscoveryDataError();
  const title=text(p.title,500);if(!title.trim())throw new DiscoveryDataError();
  const product:DiscoveryProduct={kind:p.kind as DiscoveryProduct['kind'],id:p.id as string,key:p.key as string,title,description:text(p.description,20000),mainId:slug(p.mainId),subId:slug(p.subId),price:p.price as number|null,priceText:text(p.priceText,1000),currency:p.currency===null?null:text(p.currency,12),priceUnitVerified:p.priceUnitVerified,thumbnailUrl:p.thumbnailUrl===null?null:mediaUrl(p.thumbnailUrl,apiUrl,allowLocal),photos:p.photos.map(raw=>{const a=object(raw);return{id:text(a.id,100),url:mediaUrl(a.url,apiUrl,allowLocal),thumbnailUrl:mediaUrl(a.thumbnailUrl,apiUrl,allowLocal)};}),county:p.county===null?null:text(p.county,40),district:p.district===null?null:text(p.district,40),condition:text(p.condition,30),sourceLabel:text(p.sourceLabel,200),stockStatus:text(p.stockStatus,30),date:date(p.date),dateBasis:p.dateBasis as DiscoveryProduct['dateBasis'],dateEarliest:p.dateEarliest===null?null:date(p.dateEarliest)};
  const retail=parseRetailReference(p.retail,product.key);if(retail)product.retail=retail;
  if(mapPresentation||p.mapLocation!==undefined)product.mapLocation=parsePublicMapLocation(p.mapLocation);
  if(p.match!==undefined){const m=object(p.match);if(!Number.isSafeInteger(m.wishItemId)||Number(m.wishItemId)<1||!Array.isArray(m.reasons)||m.reasons.some(r=>!['NAME','BUDGET'].includes(r))||typeof m.score!=='number'||!Number.isFinite(m.score)||m.score<0||m.score>100)throw new DiscoveryDataError();product.match={wishItemId:Number(m.wishItemId),score:m.score,reasons:m.reasons as string[]};}
  if(p.cp!==undefined){const c=object(p.cp);if(c.score!==null&&(typeof c.score!=='number'||!Number.isFinite(c.score)||c.score<0||c.score>100))throw new DiscoveryDataError();const retail=parseRetailReference(c.retail,product.key);product.cp={score:c.score as number|null,confidence:text(c.confidence,40),...(retail?{retail}:{})};}
  return product;
 });
 if(new Set(items.map(p=>p.key)).size!==items.length)throw new DiscoveryDataError();
 const categories=v.categories.map(raw=>{const c=object(raw);if(!Array.isArray(c.children)||c.children.length>100)throw new DiscoveryDataError();const children=c.children.map(raw=>{const s=object(raw);return{id:slug(s.id),label:text(s.label,100),count:count(s.count)};});if(new Set(children.map(x=>x.id)).size!==children.length)throw new DiscoveryDataError();return{id:slug(c.id),label:text(c.label,100),count:count(c.count),children};});
 if(new Set(categories.map(c=>c.id)).size!==categories.length)throw new DiscoveryDataError();
 const c=object(v.counts),counts={listing:count(c.listing),source:count(c.source),external:count(c.external)},total=count(v.total);if(counts.listing+counts.source+counts.external!==total||items.length>total||! /^[a-f0-9]{64}$/.test(text(v.snapshot,64))||v.nextCursor!==null&&(!text(v.nextCursor,600)||!items.length))throw new DiscoveryDataError();
 let mapTotals:DiscoveryPage['mapTotals'];
 if(mapPresentation||v.mapTotals!==undefined){const m=object(v.mapTotals);mapTotals={located:count(m.located),unmapped:count(m.unmapped)};if(mapTotals.located+mapTotals.unmapped!==total||items.some(p=>p.mapLocation===undefined))throw new DiscoveryDataError();}
 return{items,categories,counties:v.counties.map(x=>text(x,40)),nextCursor:v.nextCursor as string|null,snapshot:v.snapshot as string,total,counts,complete:true,generatedAt:date(v.generatedAt),unknownPriceExcluded:v.unknownPriceExcluded,...(mapTotals?{mapTotals}:{})};
}
export function nativeDiscoveryPath(filters:DiscoveryFilters,cursor='',wishItemId?:number,map?:{bbox?:[number,number,number,number]}){
 const p=new URLSearchParams();for(const key of ['q','main','sub','county','condition','min','max']as const)if(filters[key])p.set(key,filters[key]);
 p.set('source',filters.source);p.set('sort',filters.sort);p.set('limit',map?'60':'24');if(cursor)p.set('cursor',cursor);
 if(map){p.set('presentation','map');if(map.bbox)p.set('bbox',map.bbox.map(n=>Number(n.toFixed(8))).join(','));}
 if(wishItemId!==undefined){if(filters.feed!=='for-you'||!Number.isSafeInteger(wishItemId)||wishItemId<1)throw new DiscoveryDataError();p.set('wish',String(wishItemId));}
 return '/discovery'+(filters.feed==='for-you'?'/for-you':filters.feed==='cp'?'/cp':'')+'?'+p;
}
export function mergeDiscoveryPage(previous:DiscoveryPage,next:DiscoveryPage,cursor:string):DiscoveryPage{
 if(previous.snapshot!==next.snapshot||!cursor||next.nextCursor===cursor||next.items.some(p=>previous.items.some(old=>old.key===p.key)))throw new DiscoveryDataError('商品清單已更新，請重新整理。');
 return{...next,items:[...previous.items,...next.items]};
}
export function discoveryPrice(product:DiscoveryProduct){
 if(product.currency==='TWD'&&product.price!==null)return product.price===0?'免費贈送':'NT$ '+product.price.toLocaleString('zh-TW',{maximumFractionDigits:2});
 return product.priceText.trim()?(product.currency&&product.currency!=='TWD'?product.currency+' ':'')+product.priceText:'價格待詢問';
}
