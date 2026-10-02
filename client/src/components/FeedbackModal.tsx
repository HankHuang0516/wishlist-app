import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { getDisplayLocale, t } from '../utils/localization';
import { feedbackPendingKey, privatePendingStore } from '../lib/webPendingStore';
import { feedbackJournal, parseFeedbackJournal, readFeedback, sendFeedback, FeedbackError, type FeedbackReceipt } from '../lib/feedbackWeb';
import { supportText as st } from '../lib/supportCopy';
import MarketplaceDialog from './MarketplaceDialog';
import { Button } from './ui/Button';
type Props={isOpen:boolean;onClose:()=>void};
export default function FeedbackModal(props:Props){
 const {user,token,isAuthenticated}=useAuth();
 const userId=isAuthenticated&&user&&token?user.id:null;
 return <FeedbackSession key={`${userId??'anonymous'}:${token??''}`} {...props} userId={userId} token={userId===null?null:token} sessionReady={!isAuthenticated||!!user&&!!token}/>;
}
function FeedbackSession({isOpen,onClose,userId,token,sessionReady}:Props&{userId:number|null;token:string|null;sessionReady:boolean}){
 const [content,setContent]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [pending,setPending]=useState<string|null>(null),[result,setResult]=useState<FeedbackReceipt|null>(null),[notice,setNotice]=useState('');
 const [storageError,setStorageError]=useState(false),[reload,setReload]=useState(0),[cleanupOnly,setCleanupOnly]=useState(false);
 const epoch=useRef(0),lock=useRef(true),key=useRef(''),raw=useRef<string|null>(null),ack=useRef<FeedbackReceipt|null>(null);
 const mark=(value:string|null)=>{raw.current=value;setPending(value);};
 async function settle(receipt:FeedbackReceipt,original:string,generation:number){
  if(epoch.current!==generation)return;
  ack.current=receipt;setResult(receipt);setContent('');setEmail('');
  try{
   await privatePendingStore.clear(key.current,original);const remaining=await privatePendingStore.get(key.current);
   if(epoch.current!==generation)return;
   mark(remaining);ack.current=remaining===original?receipt:null;setCleanupOnly(remaining===original);
   setNotice(remaining?remaining===original?'原收件結果已確認；本機恢復紀錄尚未清理，只需重試清理。':'另一份回饋操作仍存在；請重新讀取。':'');
   if(remaining!==null&&remaining!==original){setResult(null);setStorageError(true);}
  }catch{if(epoch.current===generation){mark(original);setCleanupOnly(true);setNotice('原收件結果已確認；本機恢復紀錄尚未清理，只需重試清理。');}}
 }
 useEffect(()=>{
  const generation=++epoch.current;lock.current=true;setReady(false);
  if(!isOpen||!sessionReady)return()=>{epoch.current++;};
  setBusy(true);setStorageError(false);setNotice('');setResult(null);setCleanupOnly(false);ack.current=null;
  void(async()=>{
   try{
    const nextKey=await feedbackPendingKey(API_URL,userId),original=await privatePendingStore.get(nextKey);
    if(epoch.current!==generation)return;key.current=nextKey;
    if(original){const journal=await parseFeedbackJournal(original,userId);if(epoch.current!==generation)return;mark(original);setContent(journal.content);setEmail(journal.email);
     try{await settle(await readFeedback(original,userId,token),original,generation);}catch{if(epoch.current===generation)setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}
    }else mark(null);
   }catch{if(epoch.current===generation){setStorageError(true);setNotice('尚未安全讀取恢復資料，暫停送出；請重試讀取。');}}
   finally{if(epoch.current===generation){lock.current=false;setReady(true);setBusy(false);}}
  })();return()=>{epoch.current++;};
 },[isOpen,sessionReady,userId,token,reload]);
 async function submit(){
  if(lock.current||!ready||storageError||raw.current)return;
  const generation=epoch.current;lock.current=true;setBusy(true);setNotice('');let original:string|null=null,persisted=false;
  try{
   original=await feedbackJournal(content,email,userId,getDisplayLocale());await privatePendingStore.save(key.current,original);persisted=true;
   if(epoch.current!==generation)return;mark(original);
   await settle(await sendFeedback(original,userId,token,privatePendingStore,key.current,()=>epoch.current===generation),original,generation);
  }catch(error){if(epoch.current!==generation)return;
   if(persisted){mark(original);setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}
   else if(error instanceof FeedbackError&&error.message==='INPUT')setNotice('請輸入有效的回覆 Email 與 1–5000 字內容。');
   else{setStorageError(true);setNotice('無法安全保存原操作；沒有送出。請保留文字並重試讀取。');}
  }finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
 }
 async function recover(retry=false){
  const original=raw.current;if(!original||lock.current||storageError)return;
  const generation=epoch.current;lock.current=true;setBusy(true);setNotice('');
  try{await settle(ack.current??(retry?await sendFeedback(original,userId,token,privatePendingStore,key.current,()=>epoch.current===generation):await readFeedback(original,userId,token)),original,generation);}
  catch{if(epoch.current===generation)setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}
  finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
 }
 if(!isOpen)return null;
 const blocked=busy||!ready||storageError||!!pending;
 let operationId='';try{operationId=pending?JSON.parse(pending).clientSubmissionId:'';}catch{/* Unsafe journals never dispatch. */}
 return <MarketplaceDialog title={t('feedback.title')} onClose={onClose} closeLabel={t('feedback.close')} closeDisabled={busy}>
  {!ready&&<p role="status">{st('正在安全讀取原回饋操作…')}</p>}
  {notice&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{st(notice as Parameters<typeof st>[0])}</p>}
  {pending&&<section className="space-y-3 rounded-xl border p-3"><p className="break-all text-xs">{st('原操作識別碼：{id}',{id:operationId})}</p>
   {!storageError&&<div className="flex flex-wrap gap-2">{cleanupOnly?<Button className="min-h-11" disabled={busy} onClick={()=>void recover()}>{st('重試清理恢復紀錄')}</Button>:<><Button className="min-h-11" disabled={busy} onClick={()=>void recover()}>{st('只查核原收件結果')}</Button><Button className="min-h-11" disabled={busy} variant="outline" onClick={()=>void recover(true)}>{st('明確重試原回饋操作')}</Button></>}</div>}
  </section>}
  {storageError&&<Button className="min-h-11" disabled={busy} onClick={()=>setReload(n=>n+1)}>{st('重試安全讀取')}</Button>}
  {result?<section role="status" className="space-y-3 rounded-xl bg-green-50 p-4"><h3 className="font-semibold">{t('feedback.success')}</h3><p>{st('已保存，請保留收件編號。我們會由人工查閱與回覆。')}</p><p className="break-all">{st('收件編號：{id}',{id:result.inquiryId})}</p><p>{st(result.notificationStatus==='ACCEPTED'?'通知已交付郵件服務（不代表收件匣送達）':'收件已保存；通知尚未確認，由管理端追蹤')}</p></section>:<form className="space-y-4" onSubmit={event=>{event.preventDefault();void submit();}}>
   {userId===null&&<label className="block text-sm font-medium" htmlFor="feedback-email">{st('回覆 Email（未登入時必填）')}<input id="feedback-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} readOnly={!!pending||storageError} disabled={busy||!ready} className="mt-1 block w-full rounded-md border p-2" placeholder={t('settings.emailPlaceholder')}/></label>}
   <label htmlFor="feedback-content" className="block text-sm font-medium">{st('問題與回饋內容')}<textarea id="feedback-content" maxLength={5000} value={content} onChange={event=>setContent(event.target.value)} readOnly={!!pending||storageError} disabled={busy||!ready} className="mt-1 block min-h-[150px] w-full rounded-md border p-3" placeholder={t('feedback.placeholder')}/></label>
   <p className="text-xs text-gray-500">{t('feedback.note')}</p><Button className="min-h-11" type="submit" disabled={blocked||!content.trim()||userId===null&&!email.trim()}>{busy?t('feedback.submitting'):t('feedback.submit')}</Button>
  </form>}
  <Button className="mt-4 min-h-11 w-full" variant="outline" disabled={busy} onClick={onClose}>{pending?st('暫時關閉（保留原操作）'):t('feedback.close')}</Button>
 </MarketplaceDialog>;
}
