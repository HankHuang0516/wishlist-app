import { api } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { parseSellerDraftMedia, type SellerDraftMedia } from './sellerDraftWeb';
import { sha256, type PendingStore } from './webPendingStore';
export type PhotoRemovalJournal={version:1;clientActionId:string;mediaId:string;expectedVersion:number;requestHash:string};
export type PhotoRemovalResult={state:'REMOVED'|'CONFLICT'|'UNAVAILABLE'|'ABANDONED';media:SellerDraftMedia|null;cleanupPending:boolean};
const fail=():never=>{throw new Error('私人照片移除紀錄或回執不符，請查核原操作，不會自動重送。');};
const exact=(row:any,keys:string[])=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!==keys.sort().join(','))fail();};
const uuid=(value:unknown)=>isUuid(value)&&value===value.toLowerCase();
export async function photoRemovalJournal(mediaId:string,expectedVersion:number,clientActionId=crypto.randomUUID()){
  if(!uuid(mediaId)||!uuid(clientActionId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>1000000)return fail();
  const requestHash=await sha256(JSON.stringify({purpose:'BATCH_ITEM_REMOVAL',mediaId,expectedVersion}));
  return JSON.stringify({version:1,clientActionId,mediaId,expectedVersion,requestHash});
}
export async function parsePhotoRemovalJournal(raw:string):Promise<PhotoRemovalJournal>{
  let row;try{row=JSON.parse(raw);}catch{return fail();}
  exact(row,['version','clientActionId','mediaId','expectedVersion','requestHash']);
  if(row.version!==1||JSON.stringify(row)!==await photoRemovalJournal(row.mediaId,row.expectedVersion,row.clientActionId))return fail();
  return row;
}
export async function photoRemovalResult(value:unknown,raw:string,userId:number):Promise<PhotoRemovalResult>{
  const journal=await parsePhotoRemovalJournal(raw),row=value as any;exact(row,['receipt','media','cleanupPending']);
  const receipt=row.receipt;exact(receipt,['clientActionId','requestHash','state','mediaId','expectedVersion','createdAt']);
  if(receipt.clientActionId!==journal.clientActionId||receipt.requestHash!==journal.requestHash||!['REMOVED','CONFLICT','UNAVAILABLE','ABANDONED'].includes(receipt.state)||typeof receipt.createdAt!=='string'||!Number.isFinite(Date.parse(receipt.createdAt))||new Date(receipt.createdAt).toISOString()!==receipt.createdAt||typeof row.cleanupPending!=='boolean')return fail();
  if(receipt.state==='ABANDONED'?(receipt.mediaId!==null||receipt.expectedVersion!==null):(receipt.mediaId!==journal.mediaId||receipt.expectedVersion!==journal.expectedVersion))return fail();
  const media=parseSellerDraftMedia(row.media,userId,journal.mediaId);
  if(['REMOVED','ABANDONED'].includes(receipt.state)&&media!==null||receipt.state!=='REMOVED'&&row.cleanupPending)return fail();
  return {state:receipt.state,media,cleanupPending:row.cleanupPending};
}
const path=(row:PhotoRemovalJournal)=>'/listing-media/photo-removals/'+row.clientActionId;
export async function readPhotoRemoval(token:string,raw:string,userId:number){const row=await parsePhotoRemovalJournal(raw);return photoRemovalResult(await api(token,path(row)),raw,userId);}
export async function sendPhotoRemoval(token:string,raw:string,userId:number,store:PendingStore,key:string,active:()=>boolean){
  const row=await parsePhotoRemovalJournal(raw);await store.save(key,raw);if(!active())return fail();
  const response=await api(token,path(row),{method:'POST',body:JSON.stringify({mediaId:row.mediaId,expectedVersion:row.expectedVersion})});if(!active())return fail();return photoRemovalResult(response,raw,userId);
}
export async function abandonPhotoRemoval(token:string,raw:string,userId:number,active:()=>boolean){
  const row=await parsePhotoRemovalJournal(raw);if(!active())return fail();
  const response=await api(token,path(row)+'/abandon',{method:'POST',body:JSON.stringify({requestHash:row.requestHash})});if(!active())return fail();return photoRemovalResult(response,raw,userId);
}
