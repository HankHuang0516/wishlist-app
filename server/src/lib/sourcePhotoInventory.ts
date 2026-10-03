import { createHash } from 'crypto';
// Source-only capacity; native seller listing's separate eight-photo policy is unchanged.
export const SOURCE_PHOTO_LIMIT = 32;
export type SourcePhotoInventory = {
 archiveItemId:string; sourceUrl:string; checkedAt:string; reviewRef:string; sourceRevision:string;
 coverage:'FULL_POST'|'PARTIAL';
 photos:{sourcePhotoId:string;classification:'SAME_ITEM'|'ITEM_SPECIFICATION'|'ITEM_PACKAGING'|'OTHER_ITEM'|'OTHER_VARIANT'|'ADVERTISEMENT'|'UNKNOWN';archiveItemId?:string}[];
 ambiguities?:{kind:'ITEM_IDENTITY'|'CAPACITY'|'UNRESOLVED_MEDIA';evidenceRef:string}[];
 bindingHash:string;
};
export type PhotoCompleteness = {status:'UNVERIFIED'|'INCOMPLETE'|'IMPORTED_COMPLETE'|'STALE'|'OVER_LIMIT';sourceCount:number|null;physicalSourceCount:number|null;importedCount:number;limit:number};
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export function parsePhotoInventory(v:any,row:{archiveItemId:string;canonicalUrl:string},now=Date.now()):SourcePhotoInventory {
 if(!v||typeof v!=='object'||Array.isArray(v)||!keys(v,['archiveItemId','sourceUrl','checkedAt','reviewRef','sourceRevision','coverage','photos','ambiguities','bindingHash'])||v.archiveItemId!==row.archiveItemId||v.sourceUrl!==row.canonicalUrl||!['FULL_POST','PARTIAL'].includes(v.coverage)||!/^review:[A-Za-z0-9._/-]{4,180}$/.test(v.reviewRef)||typeof v.sourceRevision!=='string'||!v.sourceRevision.trim()||v.sourceRevision.length>180||/[\u0000-\u001f\u007f]/.test(v.sourceRevision)||!Number.isFinite(Date.parse(v.checkedAt))||Date.parse(v.checkedAt)>now||!Array.isArray(v.photos)||v.photos.length>500||!/^[a-f0-9]{64}$/.test(v.bindingHash))throw new Error('INVALID_PHOTO_INVENTORY');
 const seen=new Set<string>();
 for(const p of v.photos){if(!p||typeof p!=='object'||!keys(p,['sourcePhotoId','classification','archiveItemId'])||typeof p.sourcePhotoId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(p.sourcePhotoId)||seen.has(p.sourcePhotoId)||!['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING','OTHER_ITEM','OTHER_VARIANT','ADVERTISEMENT','UNKNOWN'].includes(p.classification)||(['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING','OTHER_ITEM'].includes(p.classification)?typeof p.archiveItemId!=='string'||!p.archiveItemId||p.archiveItemId.length>160:p.archiveItemId!==undefined)||(['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING'].includes(p.classification)&&p.archiveItemId!==row.archiveItemId)||(p.classification==='OTHER_ITEM'&&p.archiveItemId===row.archiveItemId))throw new Error('INVALID_PHOTO_ASSIGNMENT');seen.add(p.sourcePhotoId);}
 if(v.ambiguities!==undefined&&(!Array.isArray(v.ambiguities)||v.ambiguities.length>20||v.ambiguities.some((a:any)=>!a||!keys(a,['kind','evidenceRef'])||!['ITEM_IDENTITY','CAPACITY','UNRESOLVED_MEDIA'].includes(a.kind)||!/^review:[A-Za-z0-9._/-]{4,180}$/.test(a.evidenceRef))))throw new Error('INVALID_PHOTO_AMBIGUITY');
 return v;
}
// Include inventory contents AND complete media mapping: adding/replacing/reordering either invalidates approval.
export function photoBindingHash(inventory:Omit<SourcePhotoInventory,'bindingHash'>|SourcePhotoInventory,media:any[]):string {
 const {bindingHash:ignored,...source}=inventory as SourcePhotoInventory;
 const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(canonical({source,media}))).digest('hex');
}
export function photoCompleteness(row:{archiveItemId:string;canonicalUrl:string;evidence:any},visibleMedia:{id:string}[],now=Date.now()):PhotoCompleteness {
 const result:PhotoCompleteness={status:'UNVERIFIED',sourceCount:null,physicalSourceCount:null,importedCount:visibleMedia.length,limit:SOURCE_PHOTO_LIMIT};
 const e=row.evidence;
 if(!e?.photoInventory)return result;
 let inventory:SourcePhotoInventory;try{inventory=parsePhotoInventory(e.photoInventory,row,now);}catch{return result;}
 const expected=inventory.photos.filter(p=>['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING'].includes(p.classification)).map(p=>p.sourcePhotoId);
 result.sourceCount=expected.length;
 result.physicalSourceCount=inventory.photos.filter(p=>p.classification==='SAME_ITEM').length;
 if(expected.length>SOURCE_PHOTO_LIMIT)return {...result,status:'OVER_LIMIT'};
 if(now-Date.parse(inventory.checkedAt)>48*3600000||inventory.bindingHash!==photoBindingHash(inventory,Array.isArray(e.media)?e.media:[]))return {...result,status:'STALE'};
 if(inventory.coverage!=='FULL_POST'||inventory.ambiguities?.length||inventory.photos.some(p=>p.classification==='UNKNOWN'))return result;
 const media=Array.isArray(e.media)?e.media:[];
 const assigned=media.map((m:any)=>m.sourcePhotoId);
 const visible=new Set(visibleMedia.map(m=>m.id));
 const complete=expected.length>0&&expected.length===media.length&&new Set(assigned).size===assigned.length&&expected.every((id,i)=>assigned[i]===id&&media[i].sequence===i&&visible.has(media[i].id));
 return {...result,status:complete?'IMPORTED_COMPLETE':'INCOMPLETE'};
}
