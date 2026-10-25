import { useEffect, useRef, useState } from 'react';
import { getFullApiUrl } from '../config';
import { api } from '../lib/marketplaceApi';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { photoMessageRequest, photoMessageReceipt, type PhotoMessageRequest } from '../lib/chatPhoto';
import type { ChatMessage, ChatRoomRecord } from '../lib/chatData';
import { getDisplayLocale } from '../utils/localization';
import MarketplaceDialog from './MarketplaceDialog';
const say=(zh:string,en:string)=>getDisplayLocale().startsWith('zh')?zh:en;
const button='min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50';
async function digest(file:File) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function prepare(file:File) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error(say('請選擇20MB以內JPEG、PNG或WebP照片','Choose a JPEG, PNG or WebP photo under 20 MB'));
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error();ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),'image/jpeg',0.85));
    if(blob.size>5242880)throw Error(say('壓縮後照片仍超過5MB','The compressed photo exceeds 5 MB'));
    return new File([blob],'chat-photo.jpg',{type:'image/jpeg'});
  }finally{bitmap.close();}
}
export function ChatPhotoAttachment({room,token,userId,disabled,onPendingChange,onSent,compact=false}:{compact?:boolean;room:ChatRoomRecord;token:string;userId:number;disabled:boolean;onPendingChange:(value:boolean)=>void;onSent:(message:ChatMessage)=>void}) {
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[caption,setCaption]=useState(''),[open,setOpen]=useState(false),[pending,setPending]=useState<PhotoMessageRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef(''),alive=useRef(false),mutating=useRef(false),generation=useRef(0);
 useEffect(()=>{alive.current=true;const g=++generation.current;onPendingChange(true);void(async()=>{try{const k=await pendingRequestKey(getFullApiUrl(),userId,'message-photo.'+room.id),saved=await privatePendingStore.get(k);const p=saved?photoMessageRequest(JSON.parse(saved)):null;if(alive.current&&g===generation.current){key.current=k;setPending(p);setCaption(p?.text==='[商品照片]'?'':p?.text??'');setOpen(!!p);setReady(true);onPendingChange(!!p);}}catch{if(alive.current&&g===generation.current)setError(say('無法恢復照片傳送記錄，請重新開啟聊天','Cannot restore the photo receipt. Reopen this chat.'));}})();return()=>{alive.current=false;generation.current++;};},[room.id,userId,token,onPendingChange]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function choose(raw:File){if(mutating.current)return;setBusy(true);mutating.current=true;setError('');try{const next=await prepare(raw);if(pending&&await digest(next)!==pending.photoHash)throw Error(say('請選擇原照片；原傳送結果尚未確認','Choose the original photo while its receipt remains unresolved'));if(alive.current){setFile(next);setOpen(true);}}catch(e){if(alive.current)setError(e instanceof Error&&e.message?e.message:say('無法處理照片','Unable to prepare this photo'));}finally{mutating.current=false;if(alive.current)setBusy(false);}}
 async function act(lookup:boolean,abandon=false){if(!ready||mutating.current||(!pending&&(disabled||room.blocked||room.archived))||(!lookup&&!abandon&&!file))return;mutating.current=true;setBusy(true);setError('');
 try{const request=pending??photoMessageRequest({clientMessageId:crypto.randomUUID(),text:caption.trim()||'[商品照片]',photoHash:await digest(file!)}),body=JSON.stringify(request);
 if(!pending){await privatePendingStore.save(key.current,body);if(!alive.current)return;setPending(request);onPendingChange(true);}
 let value:unknown;
 if(abandon){
   const result=await api.bind(null,token)(`/chat/conversations/${room.id}/photo-messages/abandon`,{method:'POST',body}) as {state?:string;clientMessageId?:string;photoHash?:string;message?:unknown};
   if(result.state==='ABANDONED'&&result.clientMessageId===request.clientMessageId&&result.photoHash===request.photoHash){
     const cleared=await privatePendingStore.clear(key.current,body);if(!cleared&&await privatePendingStore.get(key.current)!==null)throw Error();
     if(alive.current){setPending(null);setFile(null);setCaption('');setOpen(false);onPendingChange(false);}return;
   }
   if(result.state!=='SENT')throw Error();value=result.message;
 }
 else
 if(lookup)value=await api(token,`/chat/conversations/${room.id}/messages/by-client-id/${request.clientMessageId}`);
 else{if(room.blocked||room.archived)throw Error(say('已封鎖或封存，請只查核原回執','This chat is blocked or archived. Check the original receipt.'));if(await digest(file!)!==request.photoHash)throw Error();const data=new FormData();data.append('clientMessageId',request.clientMessageId);data.append('text',request.text);data.append('photo',file!);value=await api(token,`/chat/conversations/${room.id}/photo-messages`,{method:'POST',body:data});}
 const message=photoMessageReceipt(value,room,userId,request);const cleared=await privatePendingStore.clear(key.current,body);if(!cleared&&await privatePendingStore.get(key.current)!==null)throw Error();
 if(alive.current){setPending(null);setFile(null);setCaption('');setOpen(false);onPendingChange(false);onSent(message);}
 }catch{if(alive.current)setError(say('尚未確認照片送出。請先查核原回執；不會自動重送。','Photo delivery is unconfirmed. Check its receipt first; it will not resend automatically.'));}finally{mutating.current=false;if(alive.current)setBusy(false);}}
 const picker=<label className={button+' inline-flex cursor-pointer items-center'}>{say(pending?'重新選取原照片':'選擇商品照片',pending?'Select original photo':'Choose product photo')}<input aria-label={say('選擇商品照片','Choose product photo')} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!ready||(!pending&&disabled)} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void choose(f);}}/></label>;
 return <section className="space-y-2">{!open&&<button className={button} aria-label={say('補傳商品照片','Send product photo')} disabled={disabled||busy||!ready} onClick={()=>setOpen(true)}>{compact?say('商品照片','Photo'):say('補傳商品照片','Send product photo')}</button>}{error&&<p role="alert" className="text-red-800">{error}</p>}{open&&<MarketplaceDialog title={say('傳送商品照片','Send product photo')} closeLabel={say('返回聊天','Back to chat')} closeDisabled={busy} onClose={()=>setOpen(false)}>
 <div className="space-y-4">{preview&&<img src={preview} alt={say('待傳送照片預覽','Photo preview')} className="mx-auto max-h-80 rounded-2xl object-contain"/>}{picker}{file&&!pending&&<button className={button} disabled={busy} onClick={()=>setFile(null)}>{say('移除照片','Remove photo')}</button>}
 <p className="text-sm text-gray-700">{say('每次1張・壓縮後最多5MB・移除定位資訊。照片不會公開展示。','One photo, up to 5 MB after compression. Location metadata is removed. Photos are not displayed publicly.')}</p>
 <label className="block">{say('補充說明（選填）','Caption (optional)')}<textarea value={caption} onChange={e=>setCaption(e.target.value)} disabled={!!pending||busy} maxLength={2000} className="mt-2 min-h-24 w-full rounded-xl border p-3"/></label>
 <p className="text-sm text-gray-700">{say('請勿傳送證件、付款資料或住家地址。一般檢視限對話成員，檢舉與管理查核依隱私政策處理。','Avoid identity documents, payment details and home addresses. Viewing is restricted to chat members; reports and authorized moderation follow our privacy policy.')}</p>
 {pending&&<><button className={button+' w-full'} disabled={busy} onClick={()=>void act(true)}>{say('確認照片傳送結果','Check photo delivery')}</button><p className="text-sm text-gray-700">{say('停止只會阻止尚未完成的傳送，無法收回已送出的照片。','Stopping prevents an unfinished send; it cannot recall a delivered photo.')}</p><button className={button+' w-full'} disabled={busy} onClick={()=>void act(false,true)}>{say('停止尚未完成的原傳送','Stop the unfinished send')}</button></>}
 <button className={button+' w-full bg-blue-700 text-white'} disabled={busy||!file||room.blocked||room.archived||(!pending&&disabled)} onClick={()=>void act(false)}>{busy?say('處理中…','Working…'):pending?say('重試相同照片','Retry the same photo'):say('傳送照片','Send photo')}</button></div></MarketplaceDialog>}{pending&&!open&&<button className={button} onClick={()=>setOpen(true)}>{say('照片結果待確認','Photo delivery pending')}</button>}</section>;
}
export function ChatMessagePhoto({message,token,onLoaded}:{message:ChatMessage;token:string;onLoaded?:()=>void}) {
 const [url,setUrl]=useState(''),[failed,setFailed]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true,objectUrl='';const abort=new AbortController();setUrl('');setFailed(false);void(async()=>{try{const r=await fetch(`${getFullApiUrl()}/chat/conversations/${message.conversationId}/messages/${message.id}/photo`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',redirect:'error',signal:abort.signal});if(!r.ok||!r.headers.get('Content-Type')?.startsWith('image/webp'))throw Error();const blob=await r.blob();if(blob.size>5242880)throw Error();objectUrl=URL.createObjectURL(blob);if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);}catch{if(active)setFailed(true);}})();return()=>{active=false;abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};},[message.id,message.conversationId,token]);
 return <>{url?<button type="button" className="block min-h-11" aria-label={say('放大商品照片','Enlarge product photo')} onClick={()=>setOpen(true)}><img src={url} alt={say('對話中的商品實拍','Product photo in this chat')} onLoad={onLoaded} className="max-h-72 rounded-xl object-contain"/></button>:<p>{say(failed?'照片暫時無法讀取':'照片載入中…',failed?'Photo unavailable':'Loading photo…')}</p>}{open&&url&&<MarketplaceDialog title={say('商品照片','Product photo')} closeLabel={say('關閉','Close')} onClose={()=>setOpen(false)}><img src={url} alt={say('商品照片放大檢視','Enlarged product photo')} className="max-h-[70dvh] w-full object-contain"/></MarketplaceDialog>}</>;
}
