import { api } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { sha256,type PendingStore } from './webPendingStore';
export class MarketingApprovalError extends Error {constructor(){super('原行銷確認或回執不正確；不會自動再次套用。');}}
const fail=():never=>{throw new MarketingApprovalError();};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).sort().join(',')!==[...keys].sort().join(','))fail();};
const uuid=(v:unknown)=>isUuid(v)&&v===v.toLowerCase();
export type MarketingApprovalBody={kind:'APPROVE';jobId:string;sourceMediaId:string;listingId:string|null;expectedVersion:number;selectedMediaIds:string[];copy:string};
export function marketingApprovalBody(value:unknown):MarketingApprovalBody{
  const row=object(value);exact(row,['kind','jobId','sourceMediaId','listingId','expectedVersion','selectedMediaIds','copy']);
  if(row.kind!=='APPROVE'||!uuid(row.jobId)||!uuid(row.sourceMediaId)||!(row.listingId===null||uuid(row.listingId))||!Number.isSafeInteger(row.expectedVersion)||Number(row.expectedVersion)<0||Number(row.expectedVersion)>1000000||
    !Array.isArray(row.selectedMediaIds)||!row.selectedMediaIds.length||row.selectedMediaIds.length>4||row.selectedMediaIds.some(id=>!uuid(id))||new Set(row.selectedMediaIds).size!==row.selectedMediaIds.length||
    typeof row.copy!=='string'||row.copy.trim().length<20||row.copy.length>1200||/[\u0000-\u001f\u007f]/.test(row.copy)||new TextDecoder().decode(new TextEncoder().encode(row.copy))!==row.copy)return fail();
  return {kind:'APPROVE',jobId:row.jobId as string,sourceMediaId:row.sourceMediaId as string,listingId:row.listingId as string|null,expectedVersion:Number(row.expectedVersion),selectedMediaIds:[...row.selectedMediaIds] as string[],copy:row.copy.trim()};
}
export type MarketingApprovalJournal={version:1;clientActionId:string;body:MarketingApprovalBody;requestHash:string};
export async function marketingApprovalJournal(body:MarketingApprovalBody,clientActionId=crypto.randomUUID()){
  if(!uuid(clientActionId))return fail();const normalized=marketingApprovalBody(body);
  return JSON.stringify({version:1,clientActionId,body:normalized,requestHash:await sha256(JSON.stringify(normalized))});
}
export async function parseMarketingApprovalJournal(raw:string):Promise<MarketingApprovalJournal>{
  let row;try{row=object(JSON.parse(raw));}catch{return fail();}exact(row,['version','clientActionId','body','requestHash']);
  const body=marketingApprovalBody(row.body);
  if(row.version!==1||!uuid(row.clientActionId)||JSON.stringify(body)!==JSON.stringify(row.body)||row.requestHash!==await sha256(JSON.stringify(body)))return fail();
  return row as MarketingApprovalJournal;
}
const reasons=['STALE_DETAILS','ALREADY_APPROVED','JOB_NOT_READY','INVALID_SELECTION','TOO_MANY_IMAGES','LISTING_CONFLICT','DESCRIPTION_TOO_LONG'];
export type MarketingApprovalResult={state:'APPLIED'|'CONFLICT'|'ABANDONED';reason:string|null;appliedVersion:number|null};
export async function marketingApprovalResult(value:unknown,raw:string):Promise<MarketingApprovalResult>{
  const journal=await parseMarketingApprovalJournal(raw),row=object(value);exact(row,['receipt']);
  const r=object(row.receipt);exact(r,['clientActionId','jobId','sourceMediaId','listingId','requestHash','state','reason','appliedVersion','selectedMediaIds','copy','createdAt']);
  const b=journal.body;
  if(r.clientActionId!==journal.clientActionId||r.jobId!==b.jobId||r.sourceMediaId!==b.sourceMediaId||r.listingId!==b.listingId||r.requestHash!==journal.requestHash||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString()!==r.createdAt)return fail();
  if(r.state==='APPLIED'){
    if(r.reason!==null||r.appliedVersion!==b.expectedVersion+1||JSON.stringify(r.selectedMediaIds)!==JSON.stringify(b.selectedMediaIds)||r.copy!==b.copy)return fail();
  }else if(r.state==='CONFLICT'||r.state==='ABANDONED'){
    if(r.appliedVersion!==null||r.selectedMediaIds!==null||r.copy!==null||(r.state==='CONFLICT'?!reasons.includes(String(r.reason)):r.reason!==null))return fail();
  }else return fail();
  return {state:r.state,reason:r.reason as string|null,appliedVersion:r.appliedVersion as number|null};
}
export async function readMarketingApproval(token:string,raw:string){const j=await parseMarketingApprovalJournal(raw);return marketingApprovalResult(await api(token,'/marketing/approvals/'+j.clientActionId),raw);}
export async function sendMarketingApproval(token:string,raw:string,store:PendingStore,key:string,active:()=>boolean){
  const j=await parseMarketingApprovalJournal(raw);await store.save(key,raw);if(!active())return fail();
  const value=await api(token,'/marketing/approvals/'+j.clientActionId,{method:'POST',body:JSON.stringify(j.body)});if(!active())return fail();return marketingApprovalResult(value,raw);
}
export async function abandonMarketingApproval(token:string,raw:string,active:()=>boolean){
  const j=await parseMarketingApprovalJournal(raw);if(!active())return fail();const b=j.body;
  const value=await api(token,'/marketing/approvals/'+j.clientActionId+'/abandon',{method:'POST',body:JSON.stringify({jobId:b.jobId,sourceMediaId:b.sourceMediaId,listingId:b.listingId,requestHash:j.requestHash})});if(!active())return fail();return marketingApprovalResult(value,raw);
}
