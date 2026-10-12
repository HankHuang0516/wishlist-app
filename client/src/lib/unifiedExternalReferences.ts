import type {ExternalListing} from './externalListingSearch';
import type {SourceLead} from './sourceLeadData';
export type ExternalReference={key:string;originalId:string;stockStatus:'UNKNOWN';canonicalUrl:string}&(
 {kind:'external';sourceType:'EXTERNAL_INDEX';item:ExternalListing}|{kind:'source';sourceType:'SOURCE_REFERENCE';item:SourceLead});
export function unifiedExternalReferences(index:ExternalListing[],sources:SourceLead[]):ExternalReference[]{
 const rows:ExternalReference[]=[...index.map(item=>({key:'external:'+item.id,originalId:item.id,stockStatus:'UNKNOWN' as const,canonicalUrl:item.canonicalUrl,kind:'external' as const,sourceType:'EXTERNAL_INDEX' as const,item})),...sources.map(item=>({key:'source:'+item.id,originalId:item.id,stockStatus:'UNKNOWN' as const,canonicalUrl:item.canonicalUrl,kind:'source' as const,sourceType:'SOURCE_REFERENCE' as const,item}))];
 // A post can contain several distinct goods. URL alone is never an identity.
 return [...new Map(rows.map(row=>[row.key,row])).values()];
}
export const EXTERNAL_INDEX_MAX_AGE_MS=24*3600000;
export const externalIndexCurrent=(item:ExternalListing,now:number)=>Date.parse(item.expiresAt)>now&&now-Date.parse(item.observedAt)<=EXTERNAL_INDEX_MAX_AGE_MS;
