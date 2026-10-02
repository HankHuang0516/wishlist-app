import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { API_URL } from '../config';
import { getDisplayLocale } from '../utils/localization';
import { partnerInquiryPendingKey,privatePendingStore } from '../lib/webPendingStore';
import { partnerJournal,parsePartnerJournal,readPartnerInquiry,sendPartnerInquiry,PartnerInquiryError,partnerCategories,type PartnerInput,type PartnerReceipt } from '../lib/partnerInquiryWeb';
import { partnerText as pt } from '../lib/partnerInquiryCopy';
const empty=():PartnerInput=>({organization:'',contactName:'',contactEmail:'',websiteUrl:'',categories:['FURNITURE'],estimatedActiveItems:null,updateMethod:'MANUAL',sampleUrls:[],message:'',contactConsent:false,companyFax:''});
const categoryLabels=['家具','書籍','3C','相機','樂器','玩具','服飾精品','其他'] as const;
export default function PartnerInquiryPage(){
 const [draft,setDraft]=useState(empty),[sampleText,setSampleText]=useState(''),[busy,setBusy]=useState(true),[ready,setReady]=useState(false),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<string|null>(null),[result,setResult]=useState<PartnerReceipt|null>(null),[storageError,setStorageError]=useState(false),[reload,setReload]=useState(0),[cleanupOnly,setCleanupOnly]=useState(false);
 const epoch=useRef(0),lock=useRef(true),key=useRef(''),raw=useRef<string|null>(null),ack=useRef<PartnerReceipt|null>(null);
 useLayoutEffect(()=>{epoch.current++;return()=>{epoch.current++;lock.current=true;};},[]);
 const mark=(value:string|null)=>{raw.current=value;setPending(value);};
 async function settle(receipt:PartnerReceipt,original:string,generation:number){
  if(epoch.current!==generation)return;ack.current=receipt;setResult(receipt);
  try{
   await privatePendingStore.clear(key.current,original);const remaining=await privatePendingStore.get(key.current);if(epoch.current!==generation)return;
   mark(remaining);ack.current=remaining===original?receipt:null;setCleanupOnly(remaining===original);
   if(remaining!==null&&remaining!==original){setResult(null);setStorageError(true);setNotice('另一份合作操作仍存在；請重新讀取。');}else setNotice(remaining?'原收件結果已確認；本機恢復紀錄尚未清理，只需重試清理。':'');
  }catch{if(epoch.current===generation){mark(original);setCleanupOnly(true);setNotice('原收件結果已確認；本機恢復紀錄尚未清理，只需重試清理。');}}
 }
 useEffect(()=>{
  const generation=++epoch.current;lock.current=true;setReady(false);setBusy(true);setStorageError(false);setNotice('');setResult(null);setCleanupOnly(false);ack.current=null;
  void(async()=>{
   try{const nextKey=await partnerInquiryPendingKey(API_URL),original=await privatePendingStore.get(nextKey);if(epoch.current!==generation)return;key.current=nextKey;
    if(original){const journal=await parsePartnerJournal(original);if(epoch.current!==generation)return;mark(original);setDraft(journal.input);setSampleText(journal.input.sampleUrls.join('\n'));
     try{await settle(await readPartnerInquiry(original),original,generation);}catch{if(epoch.current===generation)setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}
    }else mark(null);
   }catch{if(epoch.current===generation){setStorageError(true);setNotice('尚未安全讀取恢復資料，暫停送出；請重試讀取。');}}
   finally{if(epoch.current===generation){lock.current=false;setReady(true);setBusy(false);}}
  })();return()=>{epoch.current++;lock.current=true;};
 },[reload]);
 async function submit(){
  if(lock.current||!ready||storageError||raw.current||result)return;const generation=epoch.current;lock.current=true;setBusy(true);setNotice('');let original:string|null=null,persisted=false;
  try{original=await partnerJournal({...draft,sampleUrls:sampleText.split(/\s+/).filter(Boolean)},getDisplayLocale());await privatePendingStore.save(key.current,original);persisted=true;if(epoch.current!==generation)return;mark(original);await settle(await sendPartnerInquiry(original,privatePendingStore,key.current,()=>epoch.current===generation),original,generation);}
  catch(error){if(epoch.current!==generation)return;if(persisted){mark(original);setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}else if(error instanceof PartnerInquiryError&&error.message==='INPUT')setNotice('請核對必填欄位、Email、公開 HTTPS 連結與聯絡同意。');else{setStorageError(true);setNotice('無法安全保存原操作；沒有送出。請保留內容並重試讀取。');}}
  finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
 }
 async function recover(retry=false){
  const original=raw.current;if(!original||lock.current||storageError)return;const generation=epoch.current;lock.current=true;setBusy(true);setNotice('');
  try{await settle(ack.current??(retry?await sendPartnerInquiry(original,privatePendingStore,key.current,()=>epoch.current===generation):await readPartnerInquiry(original)),original,generation);}catch{if(epoch.current===generation)setNotice('尚未確認收件；原內容與識別碼已保留。重開只查核，不會自動重送。');}finally{if(epoch.current===generation){lock.current=false;setBusy(false);}}
 }
 const blocked=busy||!ready||storageError||!!pending,readOnly=!!pending||storageError;
 let operationId='';try{operationId=pending?JSON.parse(pending).clientSubmissionId:'';}catch{/* Unsafe journals never dispatch. */}
 return <section className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white p-6">
  <h1 className="text-3xl font-bold">{pt('提出合作意向')}</h1><p>{pt('先討論雙北 3–10 件在售二手商品。提交本表不構成商品、圖文或 AI 處理授權；取得逐件許可後才私人預檢與審核。')}</p>
  {!ready&&<p role="status">{pt('正在安全讀取原合作操作…')}</p>}{notice&&<p role="alert" className="rounded-xl bg-amber-50 p-3">{pt(notice as Parameters<typeof pt>[0])}</p>}
  {pending&&<section className="space-y-3 rounded-xl border p-3"><p className="break-all text-xs">{pt('原操作識別碼：{id}',{id:operationId})}</p>{!storageError&&<div className="flex flex-wrap gap-2">{cleanupOnly?<button className="min-h-11 rounded-xl border px-4" disabled={busy} onClick={()=>void recover()}>{pt('重試清理恢復紀錄')}</button>:<><button className="min-h-11 rounded-xl border px-4" disabled={busy} onClick={()=>void recover()}>{pt('只查核原收件結果')}</button><button className="min-h-11 rounded-xl border px-4" disabled={busy} onClick={()=>void recover(true)}>{pt('明確重試原合作操作')}</button></>}</div>}</section>}
  {storageError&&<button className="min-h-11 rounded-xl border px-4" disabled={busy} onClick={()=>setReload(n=>n+1)}>{pt('重試安全讀取')}</button>}
  {result?<section role="status" className="space-y-3 rounded-xl bg-green-50 p-4"><h2 className="font-semibold">{pt('合作意向已保存')}</h2><p className="break-all">{pt('收件編號：{id}',{id:result.inquiryId})}</p><p>{pt(result.notificationStatus==='ACCEPTED'?'通知已交付郵件服務，尚不代表收件匣送達。':'通知尚未確認，資料已保存供管理端追蹤。')}</p><p>{pt('我們會透過您提供的 Email 回覆；請保留此編號。')}</p></section>:<form className="space-y-4" onSubmit={event=>{event.preventDefault();void submit();}}>
   {([['organization','商家／來源名稱','text',120],['contactName','聯絡人','text',80],['contactEmail','回覆 Email','email',254],['websiteUrl','官方網站（選填 HTTPS）','url',500]] as const).map(([name,label,type,max])=><label key={name} className="block">{pt(label)}<input className="mt-1 block min-h-11 w-full rounded border p-2" name={name} type={type} maxLength={max} minLength={name==='contactEmail'?5:2} required={name!=='websiteUrl'} disabled={busy||!ready} readOnly={readOnly} value={draft[name]} onChange={event=>setDraft(old=>({...old,[name]:event.target.value}))}/></label>)}
   <label className="block">{pt('商品類別')}<select name="category" className="block min-h-11 w-full rounded border p-2" disabled={blocked} value={draft.categories[0]} onChange={event=>setDraft(old=>({...old,categories:[event.target.value]}))}>{partnerCategories.map((value,i)=><option key={value} value={value}>{pt(categoryLabels[i])}</option>)}</select></label>
   <label className="block">{pt('在售件數（選填，可填 0）')}<input name="estimatedActiveItems" type="number" min={0} max={1000000} step={1} className="block min-h-11 w-full rounded border p-2" disabled={busy||!ready} readOnly={readOnly} value={draft.estimatedActiveItems??''} onChange={event=>setDraft(old=>({...old,estimatedActiveItems:event.target.value===''?null:Number(event.target.value)}))}/></label>
   <label className="block">{pt('售出／撤回更新方式')}<select name="updateMethod" className="block min-h-11 w-full rounded border p-2" disabled={blocked} value={draft.updateMethod} onChange={event=>setDraft(old=>({...old,updateMethod:event.target.value}))}>{([['MANUAL','手動更新'],['CSV','CSV 檔案'],['API','API 串接'],['OTHER','其他']] as const).map(([value,label])=><option key={value} value={value}>{pt(label)}</option>)}</select></label>
   <label className="block">{pt('樣本商品 HTTPS 連結（選填，最多3個；以空白分隔）')}<textarea name="sampleUrls" maxLength={1500} className="block min-h-20 w-full rounded border p-2" disabled={busy||!ready} readOnly={readOnly} value={sampleText} onChange={event=>setSampleText(event.target.value)}/></label>
   <label className="block">{pt('合作說明、實際行政區／門市／取貨及更新方式')}<textarea name="message" maxLength={1000} className="block min-h-24 w-full rounded border p-2" disabled={busy||!ready} readOnly={readOnly} value={draft.message} onChange={event=>setDraft(old=>({...old,message:event.target.value}))}/></label>
   <div hidden><label>Fax<input name="companyFax" autoComplete="off" tabIndex={-1} disabled={busy||!ready} readOnly={readOnly} value={draft.companyFax} onChange={event=>setDraft(old=>({...old,companyFax:event.target.value}))}/></label></div>
   <label className="flex min-h-11 items-start gap-3"><input name="contactConsent" type="checkbox" required disabled={blocked} checked={draft.contactConsent} onChange={event=>setDraft(old=>({...old,contactConsent:event.target.checked}))}/>{pt('同意 Wishlist.ai 為本次合作詢問保存資料並透過 Email 聯絡；不需提供密碼。')}</label>
   <button className="min-h-11 rounded-xl bg-muji-primary px-5 py-3 text-white disabled:opacity-50" disabled={blocked}>{pt(busy?'保存中…':'送出合作意向')}</button>
  </form>}
 </section>;
}
