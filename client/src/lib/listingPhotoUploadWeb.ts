import { API_URL } from '../config';
import { api } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { sha256, type PendingStore } from './webPendingStore';

export class PhotoUploadWebError extends Error { constructor(){super('照片原操作或回執未通過核對，請安全查核，不要重傳另一張照片。');} }
const fail=():never=>{throw new PhotoUploadWebError();};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
function exact(v:Record<string,unknown>,keys:string[]){if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))fail();}
const uuid=(v:unknown)=>isUuid(v)&&v===v.toLowerCase();
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const iso=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export type PhotoUploadJournal={version:1;clientUploadId:string;sourceHash:string;capturePurpose:'BATCH_ITEM';requestHash:string;createdAt:string};
export async function uploadSourceHash(file:File){
  if(!file.size||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))return fail();
  const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new PhotoUploadWebError());reader.onerror=reader.onabort=()=>reject(new PhotoUploadWebError());reader.readAsArrayBuffer(file);});
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function photoUploadJournal(file:File,clientUploadId:string=crypto.randomUUID()){
  if(!uuid(clientUploadId))return fail();
  const sourceHash=await uploadSourceHash(file),capturePurpose='BATCH_ITEM';
  return JSON.stringify({version:1,clientUploadId,sourceHash,capturePurpose,requestHash:await sha256(JSON.stringify({sourceHash,capturePurpose})),createdAt:new Date().toISOString()});
}
export async function parsePhotoUploadJournal(raw:string):Promise<PhotoUploadJournal>{
  let row;try{row=object(JSON.parse(raw));}catch{return fail();}
  exact(row,['version','clientUploadId','sourceHash','capturePurpose','requestHash','createdAt']);
  if(row.version!==1||!uuid(row.clientUploadId)||!hash(row.sourceHash)||row.capturePurpose!=='BATCH_ITEM'||!iso(row.createdAt)||Date.parse(row.createdAt as string)>Date.now()+60_000
    ||row.requestHash!==await sha256(JSON.stringify({sourceHash:row.sourceHash,capturePurpose:row.capturePurpose})))return fail();
  return row as PhotoUploadJournal;
}
export type UploadedPhoto={id:string;listingId:string|null;wishItemId:number|null};
export type PhotoUploadResult={state:'STORED'|'ABANDONED';mediaId:string|null;media:UploadedPhoto|null};
export async function photoUploadResult(value:unknown,raw:string,userId:number):Promise<PhotoUploadResult>{
  const journal=await parsePhotoUploadJournal(raw),row=object(value);exact(row,['receipt','media']);
  const receipt=object(row.receipt);exact(receipt,['clientUploadId','requestHash','state','mediaId','createdAt']);
  if(receipt.clientUploadId!==journal.clientUploadId||receipt.requestHash!==journal.requestHash||!iso(receipt.createdAt)||!['STORED','ABANDONED'].includes(String(receipt.state)))return fail();
  if(receipt.state==='ABANDONED'){if(receipt.mediaId!==null||row.media!==null)return fail();return {state:'ABANDONED',mediaId:null,media:null};}
  if(!uuid(receipt.mediaId))return fail();
  let media:UploadedPhoto|null=null;
  if(row.media!==null){const photo=object(row.media);exact(photo,['id','ownerUserId','clientUploadId','capturePurpose','contentHash','listingId','wishItemId','imageUrl','thumbnailUrl','width','height','byteSize','createdAt']);
    const base=API_URL.replace(/\/api\/?$/,'');
    if(photo.id!==receipt.mediaId||photo.ownerUserId!==userId||typeof photo.clientUploadId!=='string'||photo.clientUploadId.toLowerCase()!==journal.clientUploadId||photo.capturePurpose!==journal.capturePurpose||!hash(photo.contentHash)||!iso(photo.createdAt)
      ||photo.imageUrl!==`${base}/api/listing-media/${photo.id}/image`||photo.thumbnailUrl!==`${base}/api/listing-media/${photo.id}/thumbnail`
      ||!integer(photo.width,1,1600)||!integer(photo.height,1,1600)||!integer(photo.byteSize,1,5*1024*1024)
      ||!(photo.listingId===null||uuid(photo.listingId))||!(photo.wishItemId===null||integer(photo.wishItemId,1,2147483647)))return fail();
    media={id:photo.id as string,listingId:photo.listingId as string|null,wishItemId:photo.wishItemId as number|null};
  }
  return {state:'STORED',mediaId:receipt.mediaId as string,media};
}
export async function readPhotoUpload(token:string,raw:string,userId:number){
  const journal=await parsePhotoUploadJournal(raw);
  return photoUploadResult(await api(token,'/listing-media/upload-receipts/'+journal.clientUploadId),raw,userId);
}
export async function sendPhotoUpload(token:string,raw:string,userId:number,file:File,store:PendingStore,key:string,active:()=>boolean){
  const journal=await parsePhotoUploadJournal(raw);
  if(await uploadSourceHash(file)!==journal.sourceHash)return fail();
  await store.save(key,raw);if(!active())return fail();
  const body=new FormData();body.append('clientUploadId',journal.clientUploadId);body.append('capturePurpose',journal.capturePurpose);body.append('image',file);
  // A transport ACK alone is not proof of the content, workflow or owner.
  // Recovery is always a read; there is never an automatic second upload.
  let ack:Record<string,unknown>|null=null, failure:unknown;
  try{ack=object(await api(token,'/listing-media',{method:'POST',body}));exact(ack,['id','imageUrl','thumbnailUrl','width','height','byteSize','createdAt']);if(!uuid(ack.id))return fail();}catch(error){failure=error;}
  if(!active())return fail();
  let result:PhotoUploadResult;
  try{result=await readPhotoUpload(token,raw,userId);}catch(error){throw failure??error;}
  if(ack&&(result.state!=='STORED'||result.mediaId!==ack.id))return fail();
  return result;
}
export async function abandonPhotoUpload(token:string,raw:string,userId:number,active:()=>boolean){
  const journal=await parsePhotoUploadJournal(raw);if(!active())return fail();
  return photoUploadResult(await api(token,'/listing-media/upload-receipts/'+journal.clientUploadId+'/abandon',{method:'POST',body:JSON.stringify({requestHash:journal.requestHash})}),raw,userId);
}
