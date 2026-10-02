import { useEffect,useRef,useState } from 'react';
import { getFullApiUrl } from '../config';
import { pendingRequestKey,privatePendingStore,type PendingStore } from './webPendingStore';
import { prepareListingUploadFile } from './listingBatch';
import { validWishId } from './wishManagement';
import { photoUploadJournal,parsePhotoUploadJournal,readPhotoUpload,sendPhotoUpload,abandonPhotoUpload,type PhotoUploadResult } from './listingPhotoUploadWeb';
import { parseWishPhotoRemovalJournal,lookupWishPhotoRemoval,submitWishPhotoRemoval } from './wishPhotoRemoval';
import { createText } from './legacyWishCreateWeb';
type Envelope={version:1;listId:number;body:string};
class ConfirmedPhotoCleanupError extends Error {}
export async function legacyPhotoEnvelope(raw:string):Promise<Envelope> {
  const row=JSON.parse(raw);
  if(!row || Array.isArray(row) || Object.keys(row).sort().join(',')!=='body,listId,version' || row.version!==1 || !validWishId(row.listId) || typeof row.body!=='string')throw new Error('Invalid photo marker');
  await parsePhotoUploadJournal(row.body,'MANUAL_PHOTO');return row;
}
type Removal=Envelope & {photo:string};
export async function legacyRemovalEnvelope(raw:string):Promise<Removal> {
  const row=JSON.parse(raw);
  if(!row || Array.isArray(row) || Object.keys(row).sort().join(',')!=='body,listId,photo,version' || row.version!==1 || typeof row.body!=='string' || typeof row.photo!=='string')throw new Error('Invalid removal marker');
  const photo=await legacyPhotoEnvelope(row.photo),journal=await parsePhotoUploadJournal(photo.body,'MANUAL_PHOTO'),removal=parseWishPhotoRemovalJournal(row.body),source=JSON.parse(removal.photoBody);
  if(row.listId!==photo.listId || source.clientUploadId!==journal.clientUploadId || source.digest!==journal.sourceHash)throw new Error('Wrong removal source');
  return row;
}
// Helpers receive their original journal, while encrypted storage additionally
// binds it to the legacy list. CAS never replaces another tab's evidence.
function adapter(outer:string,body:string):PendingStore {
  return {get:async key=>{const raw=await privatePendingStore.get(key);if(raw===null)return null;if(raw!==outer)throw new Error('Marker changed');return body;},
    save:async(key,value)=>{if(value!==body)throw new Error('Wrong body');await privatePendingStore.save(key,outer);},
    clear:async(key,value)=>{if(value!==body)throw new Error('Wrong body');return privatePendingStore.clear(key,outer);}};
}
export function useLegacyWishPhoto(userId:number|undefined,token:string|null,listId:number) {
  const alive=useRef(true),generation=useRef(0),gate=useRef(false),readyRef=useRef(false),rawRef=useRef<string|null>(null),removeRef=useRef<string|null>(null),keys=useRef({photo:'',remove:''});
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[raw,setRaw]=useState<string|null>(null),[source,setSource]=useState<number|null>(null),[removing,setRemoving]=useState(false),[result,setResult]=useState<PhotoUploadResult|null>(null),[issue,setIssue]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  const allowed=()=>alive.current && readyRef.current && !gate.current && !rawRef.current && !removeRef.current;
  const mediaId=result?.media && !result.media.listingId && !result.media.wishItemId ? result.media.id:null;
  const usable=()=>alive.current && readyRef.current && !gate.current && !removeRef.current && source===listId && !!mediaId;
  async function work(task:(current:()=>boolean)=>Promise<void>,failure=createText('photoUnknown')) {
    if(!alive.current || gate.current || !token || !userId)return;gate.current=true;setBusy(true);setIssue('');
    const version=generation.current,current=()=>alive.current && version===generation.current;
    try{await task(current);}catch(error){if(current()){if(!rawRef.current && !removeRef.current){readyRef.current=false;setReady(false);}setIssue(error instanceof ConfirmedPhotoCleanupError?createText('photoCleanup'):failure);}}finally{gate.current=false;if(current())setBusy(false);}
  }
  function accept(value:PhotoUploadResult){setResult(value);setNotice(createText(value.state==='ABANDONED' || !value.media?'photoStopped':value.media.listingId || value.media.wishItemId?'photoAttached':'photoReady'));}
  async function clearExact(key:string,expected:string,current:()=>boolean) {
    const stored=await privatePendingStore.get(key);if(!current())throw new Error('Inactive');
    if(stored!==null && (stored!==expected || !await privatePendingStore.clear(key,expected)))throw new Error('Changed marker');
  }
  async function confirmRemoval(outer:string,current:()=>boolean,confirmed=false) {
    const value=await legacyRemovalEnvelope(outer);if(!confirmed)await lookupWishPhotoRemoval(token!,value.body);if(!current())return;
    setNotice(createText('photoRemoved'));
    try {
    // First clear only the exact original photo. A newer photo survives a stale receipt.
    const photo=await privatePendingStore.get(keys.current.photo);if(!current())return;
    if(photo===value.photo)await clearExact(keys.current.photo,value.photo,current);
    await clearExact(keys.current.remove,outer,current);if(!current())return;
    removeRef.current=null;setRemoving(false);if(rawRef.current===value.photo){rawRef.current=null;setRaw(null);setSource(null);setResult(null);}
    }catch{throw new ConfirmedPhotoCleanupError();}
  }
  async function restore() {
    await work(async current=>{
      readyRef.current=false;setReady(false);
      const photo=await pendingRequestKey(getFullApiUrl(),userId!,'legacy-wish-photo'),remove=await pendingRequestKey(getFullApiUrl(),userId!,'legacy-wish-photo-remove');
      const original=await privatePendingStore.get(photo),removal=await privatePendingStore.get(remove);
      const envelope=original?await legacyPhotoEnvelope(original):null;if(removal)await legacyRemovalEnvelope(removal);if(!current())return;
      keys.current={photo,remove};rawRef.current=original;removeRef.current=removal;setRaw(original);setSource(envelope?.listId??null);setRemoving(!!removal);setResult(null);readyRef.current=true;setReady(true);setNotice('');
      if(removal)await confirmRemoval(removal,current);
      else if(envelope){const receipt=await readPhotoUpload(token!,envelope.body,userId!,'MANUAL_PHOTO');if(current())accept(receipt);}
    });
  }
  useEffect(()=>{if(userId && token)void restore();},[userId,token]);
  async function upload(file:File) {
    if(!readyRef.current || removeRef.current || rawRef.current && source!==listId || result?.state==='ABANDONED' || result?.mediaId)return;
    await work(async current=>{
      const prepared=await prepareListingUploadFile(file);if(!current())return;
      let outer=rawRef.current;
      if(!outer){const body=await photoUploadJournal(prepared,crypto.randomUUID(),'MANUAL_PHOTO');outer=JSON.stringify({version:1,listId,body});await privatePendingStore.save(keys.current.photo,outer);if(!current())return;rawRef.current=outer;setRaw(outer);setSource(listId);}
      const envelope=await legacyPhotoEnvelope(outer);
      const receipt=await sendPhotoUpload(token!,envelope.body,userId!,prepared,adapter(outer,envelope.body),keys.current.photo,current,'MANUAL_PHOTO');if(current())accept(receipt);
    });
  }
  async function check(mode:'read'|'stop') {
    if(!rawRef.current || removeRef.current)return;
    await work(async current=>{const envelope=await legacyPhotoEnvelope(rawRef.current!);const receipt=mode==='read'?await readPhotoUpload(token!,envelope.body,userId!,'MANUAL_PHOTO'):await abandonPhotoUpload(token!,envelope.body,userId!,current,'MANUAL_PHOTO');if(current())accept(receipt);});
  }
  async function clean() {
    if(!rawRef.current || removeRef.current || !result || result.media && !result.media.listingId && !result.media.wishItemId)return;
    await work(async current=>{const original=rawRef.current!;await clearExact(keys.current.photo,original,current);if(!current())return;rawRef.current=null;setRaw(null);setSource(null);setResult(null);setNotice('');},createText('photoCleanup'));
  }
  async function remove() {
    if(!usable() || !rawRef.current || !mediaId)return;
    await work(async current=>{
      const photo=rawRef.current!,envelope=await legacyPhotoEnvelope(photo),journal=await parsePhotoUploadJournal(envelope.body,'MANUAL_PHOTO');
      const body=JSON.stringify({version:1,mediaId,photoBody:JSON.stringify({version:1,clientUploadId:journal.clientUploadId,digest:journal.sourceHash})});
      const outer=JSON.stringify({version:1,listId,photo,body});await privatePendingStore.save(keys.current.remove,outer);if(!current())return;removeRef.current=outer;setRemoving(true);
      await submitWishPhotoRemoval(token!,body,adapter(outer,body),keys.current.remove,current);if(current())await confirmRemoval(outer,current,true);
    },createText('photoRemovalUnknown'));
  }
  async function checkRemoval(){if(removeRef.current)await work(current=>confirmRemoval(removeRef.current!,current),createText('photoRemovalUnknown'));}
  return {ready,busy,raw,source,removing,result,mediaId,issue,notice,allowed,usable,restore,upload,check,clean,remove,checkRemoval};
}
