import { api } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { sha256, type PendingStore } from './webPendingStore';
export class MarketingQueueError extends Error { constructor(){super('行銷原操作或回執不正確；不會自動重送。');} }
const fail=():never=>{throw new MarketingQueueError();};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).sort().join(',')!==[...keys].sort().join(','))fail();};
const uuid=(v:unknown)=>isUuid(v)&&v===v.toLowerCase();
export type MarketingQueueBody = {kind:'CREATE';sourceMediaId:string;listingId:string|null;expectedVersion:number}|
  {kind:'REVISION';sourceMediaId:string;listingId:string|null;parentJobId:string;prompt:string;slots:number[]};
export function marketingQueueBody(value:unknown):MarketingQueueBody {
  const row=object(value);
  if(!uuid(row.sourceMediaId)||!(row.listingId===null||uuid(row.listingId)))return fail();
  if(row.kind==='CREATE'){
    exact(row,['kind','sourceMediaId','listingId','expectedVersion']);
    if(!Number.isSafeInteger(row.expectedVersion)||Number(row.expectedVersion)<0||Number(row.expectedVersion)>1000000)return fail();
    return {kind:'CREATE',sourceMediaId:row.sourceMediaId as string,listingId:row.listingId as string|null,expectedVersion:Number(row.expectedVersion)};
  }
  exact(row,['kind','sourceMediaId','listingId','parentJobId','prompt','slots']);
  if(row.kind!=='REVISION'||!uuid(row.parentJobId)||typeof row.prompt!=='string'||row.prompt.trim().length<3||row.prompt.length>500||/[\u0000-\u001f\u007f]/.test(row.prompt)||new TextDecoder().decode(new TextEncoder().encode(row.prompt))!==row.prompt||
    !Array.isArray(row.slots)||!row.slots.length||row.slots.length>4||row.slots.some(v=>!Number.isInteger(v)||v<1||v>4)||new Set(row.slots).size!==row.slots.length)return fail();
  return {kind:'REVISION',sourceMediaId:row.sourceMediaId as string,listingId:row.listingId as string|null,parentJobId:row.parentJobId as string,prompt:row.prompt.trim(),slots:[...row.slots].sort((a,b)=>a-b)};
}
export type MarketingQueueJournal={version:1;clientRequestId:string;body:MarketingQueueBody;requestHash:string};
export async function marketingQueueJournal(body:MarketingQueueBody,clientRequestId=crypto.randomUUID()){
  if(!uuid(clientRequestId))return fail();const normalized=marketingQueueBody(body);
  return JSON.stringify({version:1,clientRequestId,body:normalized,requestHash:await sha256(JSON.stringify(normalized))});
}
export async function parseMarketingQueueJournal(raw:string):Promise<MarketingQueueJournal>{
  let row;try{row=object(JSON.parse(raw));}catch{return fail();} exact(row,['version','clientRequestId','body','requestHash']);
  const body=marketingQueueBody(row.body);
  if(row.version!==1||!uuid(row.clientRequestId)||JSON.stringify(body)!==JSON.stringify(row.body)||row.requestHash!==await sha256(JSON.stringify(body)))return fail();
  return row as MarketingQueueJournal;
}
const statuses=['PENDING','PROCESSING','REVIEW','COMPLETED','FAILED'];
export type MarketingMedia={id:string;marketingSlot:number;marketingSelected:boolean};
export type MarketingJob={id:string;status:'PENDING'|'PROCESSING'|'REVIEW'|'COMPLETED'|'FAILED';sourceMediaId:string;listingId:string|null;
  parentJobId:string|null;deliveredAt:string|null;copy:string|null;generatedMedia:MarketingMedia[];previousMedia:MarketingMedia[];selectedMediaIds:string[]};
export function parseMarketingJob(value:unknown,sourceMediaId:string,listingId:string|null,jobId?:string):MarketingJob {
  const row=object(value);
  if(!uuid(row.id)||jobId&&row.id!==jobId||row.sourceMediaId!==sourceMediaId||row.listingId!==listingId||!statuses.includes(String(row.status))||!(row.parentJobId===null||uuid(row.parentJobId))||
    !(row.copy===null||typeof row.copy==='string'&&row.copy.length<=1200)||!(row.deliveredAt===null||typeof row.deliveredAt==='string'&&Number.isFinite(Date.parse(row.deliveredAt))&&new Date(row.deliveredAt).toISOString()===row.deliveredAt))return fail();
  const ids=new Set<string>();
  function media(value:unknown){if(!Array.isArray(value)||value.length>4)return fail();const slots=new Set<number>();return value.map(v=>{
    const m=object(v);if(!uuid(m.id)||!Number.isInteger(m.marketingSlot)||Number(m.marketingSlot)<1||Number(m.marketingSlot)>4||typeof m.marketingSelected!=='boolean'||ids.has(m.id as string)||slots.has(m.marketingSlot as number))return fail();
    ids.add(m.id as string);slots.add(m.marketingSlot as number);return {id:m.id as string,marketingSlot:m.marketingSlot as number,marketingSelected:m.marketingSelected};});}
  const generatedMedia=media(row.generatedMedia),previousMedia=media(row.previousMedia);
  if((row.status==='REVIEW'||row.status==='COMPLETED')&&(generatedMedia.length!==4||row.deliveredAt===null||row.copy===null)||previousMedia.length&&!row.parentJobId||!Array.isArray(row.selectedMediaIds)||row.selectedMediaIds.length>4||new Set(row.selectedMediaIds).size!==row.selectedMediaIds.length||row.selectedMediaIds.some(id=>!ids.has(id)))return fail();
  const all=[...generatedMedia,...previousMedia],selected=row.selectedMediaIds as string[];
  if(new Set(selected.map(id=>all.find(m=>m.id===id)!.marketingSlot)).size!==selected.length||row.status==='COMPLETED'&&!selected.length)return fail();
  return {id:row.id as string,status:row.status as MarketingJob['status'],sourceMediaId,listingId,parentJobId:row.parentJobId as string|null,deliveredAt:row.deliveredAt as string|null,copy:row.copy as string|null,generatedMedia,previousMedia,selectedMediaIds:selected};
}
export type MarketingQueueResult={state:'QUEUED'|'ABANDONED';job:{id:string;status:'PENDING'|'PROCESSING'|'REVIEW'|'COMPLETED'|'FAILED';sourceMediaId:string;listingId:string|null;parentJobId:string|null}|null};
export async function marketingQueueResult(value:unknown,raw:string):Promise<MarketingQueueResult>{
  const journal=await parseMarketingQueueJournal(raw),row=object(value);exact(row,['receipt','job']);
  const receipt=object(row.receipt);exact(receipt,['clientRequestId','sourceMediaId','requestHash','state','jobId','createdAt']);
  if(receipt.clientRequestId!==journal.clientRequestId||receipt.sourceMediaId!==journal.body.sourceMediaId||receipt.requestHash!==journal.requestHash||!['QUEUED','ABANDONED'].includes(String(receipt.state))||
    typeof receipt.createdAt!=='string'||!Number.isFinite(Date.parse(receipt.createdAt))||new Date(receipt.createdAt).toISOString()!==receipt.createdAt||
    (receipt.state==='QUEUED'?!uuid(receipt.jobId):receipt.jobId!==null))return fail();
  let job:MarketingQueueResult['job']=null;
  if(row.job!==null){const data=object(row.job);exact(data,['id','status','sourceMediaId','listingId','parentJobId']);
    if(receipt.state!=='QUEUED'||data.id!==receipt.jobId||!statuses.includes(String(data.status))||data.sourceMediaId!==journal.body.sourceMediaId||data.listingId!==journal.body.listingId||data.parentJobId!==(journal.body.kind==='REVISION'?journal.body.parentJobId:null))return fail();
    job=data as MarketingQueueResult['job'];}
  return {state:receipt.state as MarketingQueueResult['state'],job};
}
export async function readMarketingQueue(token:string,raw:string){const j=await parseMarketingQueueJournal(raw);return marketingQueueResult(await api(token,'/marketing/requests/'+j.clientRequestId),raw);}
export async function sendMarketingQueue(token:string,raw:string,store:PendingStore,key:string,active:()=>boolean){
  const j=await parseMarketingQueueJournal(raw);await store.save(key,raw);if(!active())return fail();
  const value=await api(token,'/marketing/requests/'+j.clientRequestId,{method:'POST',body:JSON.stringify(j.body)});if(!active())return fail();return marketingQueueResult(value,raw);
}
export async function abandonMarketingQueue(token:string,raw:string,active:()=>boolean){
  const j=await parseMarketingQueueJournal(raw);if(!active())return fail();
  const value=await api(token,'/marketing/requests/'+j.clientRequestId+'/abandon',{method:'POST',body:JSON.stringify({sourceMediaId:j.body.sourceMediaId,requestHash:j.requestHash})});if(!active())return fail();return marketingQueueResult(value,raw);
}
