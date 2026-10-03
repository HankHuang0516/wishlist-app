import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL,getFullApiUrl } from '../config';
import { api, ApiFailure } from '../lib/marketplaceApi';
import { emptyListingDraft, listingCategories, prepareListingUploadFile, type ListingDraftForm, type PublishDetails } from '../lib/listingBatch';
import { buildManualListing, emptyManualDetails,manualPhotoIds } from '../lib/manualListing';
import { abandonListingCreation, draftListingCreationJournal, listingCreationJournal, parseListingCreationJournal, readListingCreation, sendListingCreation, type ListingCreationResult } from '../lib/listingCreationWeb';
import { abandonPhotoUpload, parsePhotoUploadJournal, photoUploadJournal, readPhotoUpload, sendPhotoUpload, type PhotoUploadResult } from '../lib/listingPhotoUploadWeb';
import { loadPrivateMediaPages } from '../lib/listingUploadJournal';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import PrivatePhoto from '../components/PrivateMarketplacePhoto';
import DateField from '../components/DateField';

const button='min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold';
const input='mt-1 w-full rounded-xl border border-stone-300 bg-white p-3';
export default function ManualListingPage(){
  const {token,user}=useAuth();
  if(!token||!user)return <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center">請先 <Link to="/login?next=%2Fsell%2Fmanual" className="text-blue-700 underline">登入</Link> 再儲存商品草稿。</div>;
  return <ManualSession key={`${user.id}:${token}`} token={token} userId={user.id}/>;
}
function ManualSession({token,userId}:{token:string;userId:number}){
  const [form,setForm]=useState(emptyListingDraft),[details,setDetails]=useState(emptyManualDetails);
  const [photos,setPhotos]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]),[photoError,setPhotoError]=useState('');
  const [raw,setRaw]=useState(''),[photoRaw,setPhotoRaw]=useState('');
  const [result,setResult]=useState<ListingCreationResult|null>(null),[photoResult,setPhotoResult]=useState<PhotoUploadResult|null>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tick,setTick]=useState(0),[cancel,setCancel]=useState(false);
  const life=useRef(0),busyRef=useRef(false),createKey=useRef(''),photoKey=useRef(''),creation=useRef(''),upload=useRef('');
  const active=(epoch:number)=>life.current===epoch;
  const locked=!ready||busy||!!raw||!!photoRaw;
  async function loadPhotos(epoch:number){
    if(!active(epoch))return;
    try{const rows=await loadPrivateMediaPages(cursor=>api(token,'/listing-media/unused?purpose=MANUAL_PHOTO'+(cursor?'&cursor='+cursor:'')));
      if(!active(epoch))return;
      const ids=manualPhotoIds(rows,getFullApiUrl());
      setPhotos(ids);setPhotoError('');
    }catch{if(active(epoch))setPhotoError('私人照片暫時無法讀取；可重試。沒有照片仍可儲存文字草稿。');}
  }
  async function restoreFields(value:string,epoch:number){const journal=await parseListingCreationJournal(value),body=journal.payload;if(!active(epoch))return;
    const location=body.location as Record<string,unknown>|undefined;
    setForm({title:String(body.title),description:String(body.description??''),brand:String(body.brand??''),price:body.price===undefined?'':String(body.price),category:String(body.category),condition:body.condition as 'USED'|'NEW'});
    setDetails({county:String(location?.county??''),district:String(location?.district??''),latitude:String(location?.latitude??''),longitude:String(location?.longitude??''),meetup:(body.deliveryMethods as string[]).includes('MEETUP'),shipping:(body.deliveryMethods as string[]).includes('SHIPPING'),negotiable:body.negotiable===true,expiryDate:String(body.expiryDate??''),consent:body.consentToMap===true});
    setSelected(body.mediaIds as string[]);
  }
  useEffect(()=>{const epoch=++life.current;setReady(false);setMessage('');setResult(null);setPhotoResult(null);
    void(async()=>{try{
      const [ck,pk]=await Promise.all([pendingRequestKey(API_URL,userId,'listing-manual-create'),pendingRequestKey(API_URL,userId,'listing-manual-photo')]);
      const [saved,photo]=await Promise.all([privatePendingStore.get(ck),privatePendingStore.get(pk)]);
      if(saved)await parseListingCreationJournal(saved);if(photo)await parsePhotoUploadJournal(photo,'MANUAL_PHOTO');
      if(!active(epoch))return;
      if(!saved&&creation.current){setForm(emptyListingDraft());setDetails(emptyManualDetails());setSelected([]);}
      createKey.current=ck;photoKey.current=pk;creation.current=saved??'';upload.current=photo??'';setRaw(saved??'');setPhotoRaw(photo??'');
      if(saved){await restoreFields(saved,epoch);if(!active(epoch))return;try{const proof=await readListingCreation(token,saved,userId,()=>active(epoch));if(active(epoch))setResult(proof);}catch{if(active(epoch))setMessage('前次商品操作尚未確認；只查核原操作，不會自動重送。');}}
      if(photo&&active(epoch)){try{const proof=await readPhotoUpload(token,photo,userId,'MANUAL_PHOTO',()=>active(epoch));if(active(epoch))setPhotoResult(proof);}catch{if(active(epoch))setMessage('前次照片上傳尚未確認；請先查核原照片。');}}
      if(active(epoch))setReady(true);await loadPhotos(epoch);
    }catch{if(active(epoch))setMessage('安全紀錄暫時無法讀取，已暫停送出。請重試讀取。');}})();
    return()=>{life.current++;};
  },[token,userId,tick]);
  function begin(){if(busyRef.current)return null;busyRef.current=true;setBusy(true);return life.current;}
  function end(epoch:number){if(active(epoch)){busyRef.current=false;setBusy(false);}}
  async function create(publish:boolean){
    if(locked||creation.current||upload.current)return;const epoch=begin();if(epoch===null)return;
    let pending='';
    try{const body=JSON.stringify(buildManualListing(crypto.randomUUID(),form,selected,details,publish));
      pending=await (publish?listingCreationJournal(body):draftListingCreationJournal(body));if(!active(epoch))return;
      creation.current=pending;setRaw(pending);setResult(null);setMessage('');
      const proof=await sendListingCreation(token,pending,userId,privatePendingStore,createKey.current,()=>active(epoch));
      if(active(epoch)){setResult(proof);setMessage('原商品操作已確認；不會再次新增。');}
    }catch(error){if(active(epoch))setMessage(pending?'送出結果尚未確認或安全保存失敗；請先查核原操作，內容仍保留。':error instanceof Error?error.message:'請核對商品資料。');}
    finally{end(epoch);}
  }
  async function reconcile(mode:'read'|'retry'|'abandon'){
    const saved=creation.current;if(!saved||result)return;const epoch=begin();if(epoch===null)return;setCancel(false);
    try{const proof=mode==='read'?await readListingCreation(token,saved,userId,()=>active(epoch)):mode==='retry'?await sendListingCreation(token,saved,userId,privatePendingStore,createKey.current,()=>active(epoch)):await abandonListingCreation(token,saved,userId,()=>active(epoch));
      if(active(epoch)){setResult(proof);setMessage('原商品操作已確認；不會再次新增。');}
    }catch(error){if(active(epoch))setMessage(error instanceof ApiFailure&&error.status===404?'目前未查到原操作回執；沒有重新送出。可明確重試相同內容，或安全取消。':'仍無法核對原操作；内容與原識別碼保留，不會改成另一筆商品。');}finally{end(epoch);}
  }
  async function acknowledge(){if(!result||!creation.current)return;const epoch=begin();if(epoch===null)return;
    try{if(!await privatePendingStore.clear(createKey.current,creation.current))throw Error('CAS');if(!active(epoch))return;
      creation.current='';setRaw('');setResult(null);setForm(emptyListingDraft());setDetails(emptyManualDetails());setSelected([]);setMessage('已讀原操作結果，可開始下一件商品。');await loadPhotos(epoch);
    }catch{if(active(epoch))setMessage('本機紀錄已變更或尚未安全保存；已暫停下一件商品，請重新讀取安全紀錄。');}finally{end(epoch);}
  }
  async function uploadFile(file:File|undefined){if(!file||!ready||creation.current||busyRef.current||photoResult)return;
    if(!upload.current&&selected.length>=8){setMessage('每件商品最多 8 張照片。');return;}const epoch=begin();if(epoch===null)return;
    try{const prepared=await prepareListingUploadFile(file),saved=upload.current||await photoUploadJournal(prepared,crypto.randomUUID(),'MANUAL_PHOTO');if(!active(epoch))return;
      upload.current=saved;setPhotoRaw(saved);setMessage('');
      const proof=await sendPhotoUpload(token,saved,userId,prepared,privatePendingStore,photoKey.current,()=>active(epoch),'MANUAL_PHOTO');
      if(active(epoch))setPhotoResult(proof);
    }catch{if(active(epoch))setMessage('照片上傳或原照片核對未完成；先查核原上傳，不會換一張重傳。');}finally{end(epoch);}
  }
  async function photoRecover(abandon=false){if(!upload.current||photoResult)return;const epoch=begin();if(epoch===null)return;
    try{const proof=abandon?await abandonPhotoUpload(token,upload.current,userId,()=>active(epoch),'MANUAL_PHOTO'):await readPhotoUpload(token,upload.current,userId,'MANUAL_PHOTO',()=>active(epoch));if(active(epoch))setPhotoResult(proof);
    }catch{if(active(epoch))setMessage('原照片回執仍未確認；可以重選完全相同的照片明確重試。');}finally{end(epoch);}
  }
  async function photoAcknowledge(){if(!photoResult||!upload.current)return;const epoch=begin();if(epoch===null)return;
    try{if(!await privatePendingStore.clear(photoKey.current,upload.current))throw Error('CAS');if(!active(epoch))return;
      if(photoResult.state==='STORED'&&photoResult.media&&photoResult.media.listingId===null&&photoResult.media.wishItemId===null){const id=photoResult.media.id;setSelected(ids=>ids.includes(id)||ids.length>=8?ids:[...ids,id]);}
      upload.current='';setPhotoRaw('');setPhotoResult(null);setMessage('原照片結果已核對；可以繼續填寫商品。');await loadPhotos(epoch);
    }catch{if(active(epoch))setMessage('照片紀錄清理失敗；請重新讀取安全紀錄，暫不新增照片。');}finally{end(epoch);}
  }
  const field=(key:keyof ListingDraftForm,value:string)=>setForm(old=>({...old,[key]:value}));
  const detail=(key:keyof PublishDetails,value:string|boolean)=>setDetails(old=>({...old,[key]:value}));
  return <div className="mx-auto max-w-3xl space-y-6 pb-8 text-stone-800">
    <header className="rounded-3xl bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold tracking-widest text-orange-600">商品刊登 · 手動填寫</p><h1 className="mt-2 text-3xl font-semibold">先存草稿，準備好再刊登</h1><p className="mt-3 text-sm leading-6 text-stone-600">先填名稱就能儲存不公開的商品，並在「我的商品 → 草稿」查看。照片、售價與地點可先留白；公開刊登前需備齊資料與確認地圖公開。</p><Link to="/sell" className="mt-3 inline-flex min-h-11 items-center text-blue-700 underline">返回照片批次刊登</Link></header>
    {message&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{message}</p>}
    {!ready&&<button className={button} disabled={busy} onClick={()=>setTick(value=>value+1)}>重試讀取安全紀錄</button>}
    {raw&&<section aria-label="原商品操作結果" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm">
      {result?<><h2 className="font-semibold">{result.state==='ABANDONED'?'原操作已安全取消':result.listing?.status==='DRAFT'?'商品草稿已儲存，尚未公開':'原商品已儲存，最新狀態請到我的商品查看'}</h2><p className="mt-2">{result.state==='CREATED'&&!result.listing?'原商品已移除，不會重新建立。':'不會再次新增；只清理完全相符的本機紀錄。'}</p><button className={button+' mt-3'} disabled={busy} onClick={()=>void acknowledge()}>已讀結果，開始下一件</button></>
        :<><h2 className="font-semibold">前次商品操作尚未確認</h2><p className="mt-2">原內容已鎖定；查核只讀取結果。重試仍使用相同內容與原識別碼。</p><div className="mt-3 flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>void reconcile('read')}>只查核原商品結果</button><button className={button} disabled={busy} onClick={()=>void reconcile('retry')}>明確重試同一商品操作</button><button className={button} disabled={busy} onClick={()=>setCancel(true)}>安全取消原商品操作…</button></div>{cancel&&<div className="mt-3"><p>只取消尚未完成的操作；若已儲存，會回報原商品，商品與照片都不會刪除。</p><button className={button+' mt-2'} disabled={busy} onClick={()=>void reconcile('abandon')}>確認安全取消原商品操作</button></div>}</>}
      <button className={button+' mt-3'} disabled={busy} onClick={()=>setTick(value=>value+1)}>重新讀取安全紀錄</button>
    </section>}
    {photoRaw&&<section aria-label="原照片上傳結果" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm"><h2 className="font-semibold">{photoResult?photoResult.state==='STORED'?'原照片上傳已確認':'原照片上傳已安全取消':'原照片上傳尚未確認'}</h2>
      {photoResult?<><p className="mt-2">{photoResult.state==='STORED'&&(!photoResult.media||photoResult.media.listingId||photoResult.media.wishItemId)?'照片已使用或移除，不會重建或再次加入商品。':'只核對原上傳；照片仍保持私人狀態。'}</p><button className={button+' mt-3'} disabled={busy} onClick={()=>void photoAcknowledge()}>已讀原照片結果，繼續填寫</button></>:<div className="mt-3 flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>void photoRecover()}>只查核原照片上傳</button><label className={button}>重選原照片並重試<input aria-label="重選原照片並重試" type="file" accept="image/*" className="sr-only" disabled={busy||!ready} onChange={event=>{void uploadFile(event.target.files?.[0]);event.target.value='';}}/></label><button className={button} disabled={busy} onClick={()=>void photoRecover(true)}>安全取消原照片上傳</button></div>}
      <button className={button+' mt-3'} disabled={busy} onClick={()=>setTick(value=>value+1)}>重新讀取照片安全紀錄</button>
    </section>}
    <fieldset disabled={locked} className="space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8"><legend className="sr-only">商品資料</legend>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">商品名稱<input className={input} maxLength={100} value={form.title} onChange={e=>field('title',e.target.value)}/></label><label className="text-sm">品牌（選填）<input className={input} maxLength={60} value={form.brand} onChange={e=>field('brand',e.target.value)}/></label>
        <label className="text-sm">分類<select className={input} value={form.category} onChange={e=>field('category',e.target.value)}>{listingCategories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">新舊狀態<select className={input} value={form.condition} onChange={e=>field('condition',e.target.value)}><option value="USED">二手</option><option value="NEW">全新</option></select></label>
        <label className="text-sm">賣家售價（TWD，草稿可留白）<input className={input} inputMode="decimal" maxLength={32} value={form.price} onChange={e=>field('price',e.target.value)}/></label><label className="text-sm sm:col-span-2">商品說明（草稿可留白）<textarea className={input+' min-h-32'} maxLength={3000} value={form.description} onChange={e=>field('description',e.target.value)}/></label></div>
      <section aria-label="商品照片"><h2 className="font-semibold">照片（草稿可不選，最多 8 張）</h2><label className={button+' mt-3 inline-flex cursor-pointer'}>新增私人照片<input aria-label="新增私人照片" type="file" accept="image/*" className="sr-only" onChange={e=>{void uploadFile(e.target.files?.[0]);e.target.value='';}}/></label><p className="mt-2 text-xs text-stone-500">上傳後先核對結果，再加入此件商品。取消勾選只移出本次選擇，照片仍保留。</p>{photoError&&<p className="mt-2 text-sm text-amber-800">{photoError}</p>}<button className={button+' mt-3'} onClick={()=>void loadPhotos(life.current)}>重新讀取私人照片</button>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((id,index)=><label key={id} className="rounded-xl border p-3"><PrivatePhoto id={id} token={token} label={`私人商品照片 ${index+1}`}/><span className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id)&&selected.length>=8} onChange={()=>setSelected(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id])}/>{`選用照片 ${index+1}`}</span></label>)}</div></section>
      <section className="space-y-3"><h2 className="font-semibold">交付與地點（草稿可留白）</h2><div className="flex flex-wrap gap-5"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={details.meetup} onChange={e=>detail('meetup',e.target.checked)}/>面交</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={details.shipping} onChange={e=>detail('shipping',e.target.checked)}/>寄送</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={details.negotiable} onChange={e=>detail('negotiable',e.target.checked)}/>可議價</label></div>
        <div className="grid gap-4 sm:grid-cols-2">{([['county','縣市'],['district','行政區'],['latitude','緯度'],['longitude','經度']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input className={input} maxLength={30} value={details[key]} onChange={e=>detail(key,e.target.value)}/></label>)}</div><p className="text-xs text-stone-500">儲存前會轉為約 2 公里網格位置；不保存精確座標。地點可全部留白儲存草稿。</p>
        <DateField label="失效日期（選填，台灣時間）" disabled={locked} value={details.expiryDate} onChange={value=>detail('expiryDate',value)}/><label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={details.consent} onChange={e=>detail('consent',e.target.checked)}/>我同意公開商品至地圖；未勾選仍可儲存不公開草稿</label></section>
      <div className="flex flex-wrap gap-3"><button className={button} onClick={()=>void create(false)}>儲存商品草稿（不公開）</button><button className={button+' bg-stone-900 text-white'} onClick={()=>void create(true)}>確認並公開刊登</button></div>
    </fieldset><Link to="/my-listings" className="inline-flex min-h-11 items-center rounded-xl border bg-white px-5 py-3 text-sm text-blue-700">前往我的商品查看與管理</Link>
  </div>;
}
