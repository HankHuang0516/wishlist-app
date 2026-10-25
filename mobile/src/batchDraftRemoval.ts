import * as Crypto from 'expo-crypto';
import {createApi} from './api';
import {uuid} from './listingForm';
import {parseSellerDraft} from './listingSellerDraft';
export type BatchRemoval={version:1;clientActionId:string;mediaId:string;expectedVersion:number;captureKey:string;requestHash:string};
export type BatchRemovalResult={state:'REMOVED'|'CONFLICT'|'UNAVAILABLE'|'ABANDONED';cleanupPending:boolean};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid removal proof');return v as Record<string,unknown>;};
const exact=(v:Record<string,unknown>,keys:string[])=>{if(Object.keys(v).sort().join(',')!==keys.sort().join(','))throw Error('Invalid removal proof');};
export async function batchRemovalJournal(mediaId:string,expectedVersion:number,clientActionId=Crypto.randomUUID(),captureKey=mediaId){
 if(!uuid(captureKey)||captureKey!==captureKey.toLowerCase()||!uuid(mediaId)||!uuid(clientActionId)||mediaId!==mediaId.toLowerCase()||clientActionId!==clientActionId.toLowerCase()||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>1000000)throw Error('Invalid draft identity');
 const requestHash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify({purpose:'BATCH_ITEM_REMOVAL',mediaId,expectedVersion}));
 return JSON.stringify({version:1,clientActionId,mediaId,expectedVersion,captureKey,requestHash});
}
export async function parseBatchRemoval(raw:string):Promise<BatchRemoval>{
 const v=object(JSON.parse(raw));exact(v,['version','clientActionId','mediaId','expectedVersion','captureKey','requestHash']);
 if(v.version!==1||raw!==await batchRemovalJournal(v.mediaId as string,v.expectedVersion as number,v.clientActionId as string,v.captureKey as string))throw Error('Invalid removal journal');
 return v as BatchRemoval;
}
export async function batchRemovalResult(value:unknown,raw:string,userId:number):Promise<BatchRemovalResult>{
 const op=await parseBatchRemoval(raw),v=object(value);exact(v,['receipt','media','cleanupPending']);const r=object(v.receipt);exact(r,['clientActionId','requestHash','state','mediaId','expectedVersion','createdAt']);
 if(r.clientActionId!==op.clientActionId||r.requestHash!==op.requestHash||!['REMOVED','CONFLICT','UNAVAILABLE','ABANDONED'].includes(String(r.state))||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString()!==r.createdAt||typeof v.cleanupPending!=='boolean'||(r.state==='ABANDONED'?(r.mediaId!==null||r.expectedVersion!==null):(r.mediaId!==op.mediaId||r.expectedVersion!==op.expectedVersion)))throw Error('Mismatched removal receipt');
 if(v.media!==null){const m=object(v.media);exact(m,['id','ownerUserId','listingId','wishItemId','capturePurpose','sellerDraft','sellerDraftVersion']);if(m.id!==op.mediaId||m.ownerUserId!==userId||!Number.isSafeInteger(m.sellerDraftVersion)||Number(m.sellerDraftVersion)<0||!(m.listingId===null||uuid(m.listingId))||!(m.wishItemId===null||Number.isSafeInteger(m.wishItemId)&&Number(m.wishItemId)>0)||!['BATCH_ITEM','MANUAL_PHOTO','LEGACY_UNKNOWN','AI_MARKETING'].includes(String(m.capturePurpose)))throw Error('Foreign draft receipt');parseSellerDraft(m.sellerDraft);}
 if(['REMOVED','ABANDONED'].includes(String(r.state))&&v.media!==null||r.state!=='REMOVED'&&v.cleanupPending)throw Error('Invalid removal outcome');
 return {state:r.state as BatchRemovalResult['state'],cleanupPending:v.cleanupPending};
}
type Api=ReturnType<typeof createApi>;
export async function readBatchRemoval(api:Api,raw:string,userId:number){const op=await parseBatchRemoval(raw);return batchRemovalResult(await api('/listing-media/photo-removals/'+op.clientActionId),raw,userId);}
export async function sendBatchRemoval(api:Api,raw:string,userId:number,save:()=>Promise<void>,active:()=>boolean){
 const op=await parseBatchRemoval(raw);await save();if(!active())throw Error('Draft scope changed');
 return batchRemovalResult(await api('/listing-media/photo-removals/'+op.clientActionId,{method:'POST',body:JSON.stringify({mediaId:op.mediaId,expectedVersion:op.expectedVersion})}),raw,userId);
}
