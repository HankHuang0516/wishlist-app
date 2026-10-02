import { api } from './marketplaceApi';
import { sha256, type PendingStore } from './webPendingStore';
export type FollowState={userId:number;targetUserId:number|null;targetExists:boolean;isFollowing:boolean;followingCount:number;followingVersion:number;isPremium:boolean;maxFollowing:number};
export type FollowJournal={version:1;clientActionId:string;targetUserId:number;wanted:boolean;expectedVersion:number;requestHash:string};
export type FollowResult={state:'APPLIED'|'CONFLICT'|'LIMIT'|'UNAVAILABLE'|'ABANDONED';current:FollowState};
export class FollowError extends Error{}
const fail=():never=>{throw new FollowError('追蹤資料或回執無法核對，請重試查核。');};
const integer=(value:unknown,min=0,max=2147483647)=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
export function parseFollowState(value:unknown,userId:number,targetUserId:number|null):FollowState{
    if(!value||typeof value!=='object'||Array.isArray(value))return fail();const row=value as Record<string,unknown>;
    if(row.userId!==userId||row.targetUserId!==targetUserId||!integer(userId,1)||targetUserId!==null&&!integer(targetUserId,1)||!integer(row.followingVersion)||!integer(row.followingCount)||!integer(row.maxFollowing)||['isPremium','isFollowing','targetExists'].some(key=>typeof row[key]!=='boolean')||(!row.targetExists&&row.isFollowing)||targetUserId===null&&(row.targetExists||row.isFollowing))return fail();
    return {userId,targetUserId,targetExists:row.targetExists as boolean,isFollowing:row.isFollowing as boolean,followingCount:Number(row.followingCount),followingVersion:Number(row.followingVersion),isPremium:row.isPremium as boolean,maxFollowing:Number(row.maxFollowing)};
}
const input=(journal:FollowJournal)=>({targetUserId:journal.targetUserId,wanted:journal.wanted,expectedVersion:journal.expectedVersion});
export async function followJournal(targetUserId:number,wanted:boolean,expectedVersion:number,clientActionId=crypto.randomUUID()):Promise<string>{
    const data={targetUserId,wanted,expectedVersion},raw=JSON.stringify({version:1,clientActionId,...data,requestHash:await sha256(JSON.stringify(data))});
    await parseFollowJournal(raw);return raw;
}
export async function parseFollowJournal(raw:string):Promise<FollowJournal>{
    let row;try{row=JSON.parse(raw);}catch{return fail();}
    if(!row||Object.keys(row).sort().join(',')!=='clientActionId,expectedVersion,requestHash,targetUserId,version,wanted'||row.version!==1||typeof row.clientActionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.clientActionId)||!integer(row.targetUserId,1)||typeof row.wanted!=='boolean'||!integer(row.expectedVersion,0,2147483646)||row.requestHash!==await sha256(JSON.stringify(input(row))))return fail();return row;
}
export async function followResult(value:unknown,raw:string,userId:number):Promise<FollowResult>{
    const original=await parseFollowJournal(raw),row=value as Record<string,any>,receipt=row?.receipt;
    if(!receipt||receipt.clientActionId!==original.clientActionId||receipt.requestHash!==original.requestHash||!['APPLIED','CONFLICT','LIMIT','UNAVAILABLE','ABANDONED'].includes(receipt.state)||typeof receipt.createdAt!=='string'||!Number.isFinite(Date.parse(receipt.createdAt))||new Date(receipt.createdAt).toISOString()!==receipt.createdAt)return fail();
    const abandoned=receipt.state==='ABANDONED';
    if(abandoned?(receipt.targetUserId!==null||receipt.wanted!==null||receipt.expectedVersion!==null||receipt.appliedVersion!==null):(receipt.targetUserId!==original.targetUserId||receipt.wanted!==original.wanted||receipt.expectedVersion!==original.expectedVersion||(receipt.state==='APPLIED'?receipt.appliedVersion!==original.expectedVersion+1:receipt.appliedVersion!==null)))return fail();
    const current=parseFollowState(row.current,userId,abandoned?null:original.targetUserId);
    if(receipt.state==='APPLIED'&&(current.followingVersion<receipt.appliedVersion||current.followingVersion===receipt.appliedVersion&&current.targetExists&&current.isFollowing!==original.wanted))return fail();
    return {state:receipt.state,current};
}
const path=(journal:FollowJournal)=>'/users/me/follow-operations/'+journal.clientActionId;
export async function readFollowOperation(token:string,raw:string,userId:number){const journal=await parseFollowJournal(raw);return followResult(await api(token,path(journal)),raw,userId);}
export async function sendFollowOperation(token:string,raw:string,userId:number,store:PendingStore,key:string,active:()=>boolean){
    const journal=await parseFollowJournal(raw);if(journal.targetUserId===userId)return fail();await store.save(key,raw);if(!active())throw new FollowError('已離開此帳號，未送出追蹤操作。');
    return followResult(await api(token,path(journal),{method:'POST',body:JSON.stringify(input(journal))}),raw,userId);
}
export async function abandonFollowOperation(token:string,raw:string,userId:number,active:()=>boolean){
    const journal=await parseFollowJournal(raw);if(!active())throw new FollowError('已離開此帳號，未取消原操作。');
    return followResult(await api(token,path(journal)+'/abandon',{method:'POST',body:JSON.stringify({requestHash:journal.requestHash})}),raw,userId);
}
