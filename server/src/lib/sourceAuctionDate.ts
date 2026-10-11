import {LeadError,publicUrl,ref} from './sourceLeadPrimitives';
export type ActiveAuctionWindow={startsAt:string;endsAt:string;timeZone:'Asia/Taipei'};
export type OfficialAuctionDateBasis={sourceType:'OFFICIAL_AUCTION';dateBasis:'ACTIVE_AUCTION_WINDOW';originalPublishedAt:null;priceType:'STARTING_BID';activeAuctionWindow:ActiveAuctionWindow};
export type OriginalPublicationDateBasis={sourceType?:never;dateBasis?:never;originalPublishedAt?:never;priceType?:never;activeAuctionWindow?:never};
export type SourceDateBasis=OriginalPublicationDateBasis|OfficialAuctionDateBasis;
export type AuctionEvidenceBinding={authorityRef:string;periodRef:string;sourceUrl:string};
export const OFFICIAL_AUCTION_HOST='recycledstuff.ntpc.gov.tw';
// Exact reviewed official item route. No generic gov domain or Facebook exception.
export function officialAuctionUrl(value:unknown) {
 const url=publicUrl(value,OFFICIAL_AUCTION_HOST);
 if(!/^\/Product\/Detail\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(new URL(url).pathname))throw new LeadError('OFFICIAL_AUCTION_ITEM_REQUIRED');
 return url;
}
const obj=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new LeadError('OFFICIAL_AUCTION_EVIDENCE_REQUIRED');return v as Record<string,any>;};
const exact=(v:Record<string,any>,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw new LeadError('OFFICIAL_AUCTION_EVIDENCE_REQUIRED');};
export const parseAuctionInstant=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw new LeadError('OFFICIAL_AUCTION_WINDOW_REQUIRED');const parsed=new Date(v);const expected=v.replace(/(?:\.(\d{1,3}))?Z$/,(_match,digits:string|undefined)=>'.'+(digits??'').padEnd(3,'0')+'Z');if(parsed.toISOString()!==expected)throw new LeadError('OFFICIAL_AUCTION_WINDOW_REQUIRED');return parsed;};
export function parseOfficialAuction(value:unknown,sourceUrl:string,dateRef:string,now=new Date()):OfficialAuctionDateBasis{
 const a=obj(value);exact(a,['sourceType','dateBasis','originalPublishedAt','priceType','authorityRef','activeAuctionWindow']);
 if(a.sourceType!=='OFFICIAL_AUCTION'||a.dateBasis!=='ACTIVE_AUCTION_WINDOW'||a.originalPublishedAt!==null||a.priceType!=='STARTING_BID'||!ref(a.authorityRef))throw new LeadError('OFFICIAL_AUCTION_EVIDENCE_REQUIRED');
 officialAuctionUrl(sourceUrl);
 const w=obj(a.activeAuctionWindow);exact(w,['startsAt','endsAt','timeZone','sourceUrl','periodRef']);
 const startsAt=parseAuctionInstant(w.startsAt),endsAt=parseAuctionInstant(w.endsAt);
 if(w.timeZone!=='Asia/Taipei'||w.sourceUrl!==sourceUrl||!ref(w.periodRef)||w.periodRef!==dateRef||startsAt>now||endsAt<=now||startsAt>=endsAt)throw new LeadError('OFFICIAL_AUCTION_WINDOW_REQUIRED');
 return {sourceType:'OFFICIAL_AUCTION' as const,dateBasis:'ACTIVE_AUCTION_WINDOW' as const,originalPublishedAt:null,
  priceType:'STARTING_BID' as const,activeAuctionWindow:{startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),timeZone:'Asia/Taipei' as const}};
}

export function parseOfficialAuctionBinding(value:unknown,sourceUrl:string,dateRef:string,now=new Date()):{date:OfficialAuctionDateBasis;binding:AuctionEvidenceBinding}{
 const date=parseOfficialAuction(value,sourceUrl,dateRef,now),e=obj(value),w=obj(e.activeAuctionWindow);
 return {date,binding:{authorityRef:e.authorityRef,periodRef:w.periodRef,sourceUrl:w.sourceUrl}};
}
