import { api } from './marketplaceApi';
import { isUuid, listingCategories, type SellerDraft } from './listingBatch';
import { sha256, type PendingStore } from './webPendingStore';

export class SellerDraftWebError extends Error { constructor(){super('私人草稿原操作或回執不正確，請安全查核；不會自動重送。');} }
const fail=():never=>{throw new SellerDraftWebError();};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))fail();};
const uuid=(v:unknown)=>isUuid(v)&&v===v.toLowerCase();
const integer=(v:unknown,min=0,max=1000001)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
function text(v:unknown,max:number){if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||new TextDecoder().decode(new TextEncoder().encode(v))!==v)return fail();return v;}
export function normalizedSellerDraft(value:unknown):SellerDraft {
  const draft=object(value);exact(draft,['clientListingId','form','touched']);
  if(!isUuid(draft.clientListingId))return fail();
  const form=object(draft.form);exact(form,['title','description','brand','category','condition','price']);
  const title=text(form.title,100),description=text(form.description,3000),brand=text(form.brand,60),price=text(form.price,13);
  if(!listingCategories.some(([k])=>k===form.category)||!['NEW','USED'].includes(String(form.condition))||price!==''&&(!/^\d{1,10}(?:\.\d{1,2})?$/.test(price)||Number(price)>9999999999.99))return fail();
  const touched=object(draft.touched);
  if(Object.entries(touched).some(([k,v])=>!['title','description','brand','category','condition','price'].includes(k)||v!==true))return fail();
  return {clientListingId:draft.clientListingId.toLowerCase(),form:{title,description,brand,category:form.category as SellerDraft['form']['category'],condition:form.condition as SellerDraft['form']['condition'],price},touched:Object.fromEntries(Object.keys(touched).sort().map(k=>[k,true]))};
}
export type SellerDraftJournal={version:1;clientActionId:string;mediaId:string;expectedVersion:number;draft:SellerDraft;requestHash:string};
export async function sellerDraftJournal(mediaId:string,expectedVersion:number,draft:SellerDraft,clientActionId:string=crypto.randomUUID()){
  if(!uuid(mediaId)||!uuid(clientActionId)||!integer(expectedVersion,0,1000000))return fail();
  const normalized=normalizedSellerDraft(draft),requestHash=await sha256(JSON.stringify({mediaId,expectedVersion,draft:normalized}));
  return JSON.stringify({version:1,clientActionId,mediaId,expectedVersion,draft:normalized,requestHash});
}
export async function parseSellerDraftJournal(raw:string):Promise<SellerDraftJournal>{
  let row;try{row=object(JSON.parse(raw));}catch{return fail();}
  exact(row,['version','clientActionId','mediaId','expectedVersion','draft','requestHash']);
  if(row.version!==1||!uuid(row.clientActionId)||!uuid(row.mediaId)||!integer(row.expectedVersion,0,1000000))return fail();
  const draft=normalizedSellerDraft(row.draft);
  if(JSON.stringify(draft)!==JSON.stringify(row.draft)||row.requestHash!==await sha256(JSON.stringify({mediaId:row.mediaId,expectedVersion:row.expectedVersion,draft})))return fail();
  return row as SellerDraftJournal;
}
export type SellerDraftMedia={id:string;ownerUserId:number;listingId:string|null;wishItemId:number|null;capturePurpose:string;sellerDraft:SellerDraft|null;sellerDraftVersion:number};
export type SellerDraftResult={state:'APPLIED'|'CONFLICT'|'ABANDONED';appliedVersion:number|null;media:SellerDraftMedia|null;current:boolean};
export async function sellerDraftResult(value:unknown,raw:string,userId:number):Promise<SellerDraftResult>{
  const journal=await parseSellerDraftJournal(raw),row=object(value);exact(row,['receipt','media']);
  const receipt=object(row.receipt);exact(receipt,['clientActionId','mediaId','requestHash','state','appliedVersion','createdAt']);
  if(receipt.clientActionId!==journal.clientActionId||receipt.mediaId!==journal.mediaId||receipt.requestHash!==journal.requestHash||!['APPLIED','CONFLICT','ABANDONED'].includes(String(receipt.state))||typeof receipt.createdAt!=='string'||!Number.isFinite(Date.parse(receipt.createdAt))||new Date(receipt.createdAt).toISOString()!==receipt.createdAt||
    (receipt.state==='APPLIED'?receipt.appliedVersion!==journal.expectedVersion+1:receipt.appliedVersion!==null))return fail();
  let media:SellerDraftMedia|null=null;
  if(row.media!==null){const item=object(row.media);exact(item,['id','ownerUserId','listingId','wishItemId','capturePurpose','sellerDraft','sellerDraftVersion']);
    if(item.id!==journal.mediaId||item.ownerUserId!==userId||!integer(item.sellerDraftVersion)||!(item.listingId===null||uuid(item.listingId))||!(item.wishItemId===null||integer(item.wishItemId,1,2147483647))||!['BATCH_ITEM','MANUAL_PHOTO','LEGACY_UNKNOWN','AI_MARKETING'].includes(String(item.capturePurpose)))return fail();
    const draft=item.sellerDraft===null?null:normalizedSellerDraft(item.sellerDraft);
    media={...item,sellerDraft:draft} as SellerDraftMedia;
    if(receipt.state==='APPLIED'&&media.sellerDraftVersion<Number(receipt.appliedVersion))return fail();
  }
  const current=receipt.state==='APPLIED'&&!!media&&media.sellerDraftVersion===receipt.appliedVersion&&media.listingId===null&&media.wishItemId===null&&media.capturePurpose==='BATCH_ITEM';
  if(current&&JSON.stringify(media!.sellerDraft)!==JSON.stringify(journal.draft))return fail();
  return {state:receipt.state as SellerDraftResult['state'],appliedVersion:receipt.appliedVersion as number|null,media,current};
}
export async function readSellerDraftOperation(token:string,raw:string,userId:number){const journal=await parseSellerDraftJournal(raw);return sellerDraftResult(await api(token,'/listing-media/seller-draft-operations/'+journal.clientActionId),raw,userId);}
export async function sendSellerDraftOperation(token:string,raw:string,userId:number,store:PendingStore,key:string,active:()=>boolean){
  const journal=await parseSellerDraftJournal(raw);await store.save(key,raw);if(!active())return fail();
  const result=await api(token,`/listing-media/${journal.mediaId}/seller-draft-operations/${journal.clientActionId}`,{method:'POST',body:JSON.stringify({expectedVersion:journal.expectedVersion,draft:journal.draft})});
  if(!active())return fail();return sellerDraftResult(result,raw,userId);
}
export async function abandonSellerDraftOperation(token:string,raw:string,userId:number,active:()=>boolean){
  const journal=await parseSellerDraftJournal(raw);if(!active())return fail();
  return sellerDraftResult(await api(token,`/listing-media/${journal.mediaId}/seller-draft-operations/${journal.clientActionId}/abandon`,{method:'POST',body:JSON.stringify({requestHash:journal.requestHash})}),raw,userId);
}
