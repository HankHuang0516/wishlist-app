import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure } from '../lib/marketplaceApi';
import PrivatePhoto from './PrivateMarketplacePhoto';
import { API_URL } from '../config';
import { pendingRequestKey, privatePendingStore } from '../lib/webPendingStore';
import { abandonMarketingQueue, marketingQueueJournal, parseMarketingQueueJournal, parseMarketingJob, readMarketingQueue, sendMarketingQueue, type MarketingJob, type MarketingQueueBody, type MarketingQueueResult } from '../lib/marketingQueueWeb';
import { abandonMarketingApproval,marketingApprovalJournal,parseMarketingApprovalJournal,readMarketingApproval,sendMarketingApproval,type MarketingApprovalBody,type MarketingApprovalResult } from '../lib/marketingApprovalWeb';

type Props={token:string;userId:number;sourceMediaId:string;listingId?:string;getExpectedVersion:()=>number;beforeStart:()=>Promise<boolean>;beforeApprove:()=>Promise<(()=>void)|null>;onApproved:()=>Promise<void>};
export default function MarketingAssistantWeb(props:Props){return <MarketingAssistantSession key={`${props.userId}:${props.token}:${props.sourceMediaId}:${props.listingId??''}`} {...props} />;}
function MarketingAssistantSession({ token, userId, sourceMediaId, listingId, getExpectedVersion, beforeStart, beforeApprove, onApproved }:Props) {
  const [enabled, setEnabled] = useState(false), [job, setJob] = useState<MarketingJob | null>(null);
  const [copy, setCopy] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [adjustment, setAdjustment] = useState(''), [slots, setSlots] = useState<number[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const approvalOriginal=useRef(''),approvalConfirmed=useRef<MarketingApprovalResult|null>(null);
  const [approvalDetails,setApprovalDetails]=useState<MarketingApprovalBody|null>(null),[approvalResult,setApprovalResult]=useState<MarketingApprovalResult|null>(null),[approvalCancel,setApprovalCancel]=useState(false);
  const sortList = useRef<HTMLOListElement>(null);
  const running = useRef(false), active = useRef(true);
  const lifetime=useRef(0),queueKey=useRef(''),queueOriginal=useRef(''),queueConfirmed=useRef<MarketingQueueResult|null>(null);
  const [queuePending,setQueuePending]=useState(''),[queueReady,setQueueReady]=useState(false),[queueCleanup,setQueueCleanup]=useState(false),[cancelConfirm,setCancelConfirm]=useState(false),[readTick,setReadTick]=useState(0);
  const [queueDetails,setQueueDetails]=useState<MarketingQueueBody|null>(null);
  useEffect(()=>{lifetime.current++;return()=>{lifetime.current++;};},[]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    const epoch=lifetime.current,isActive=()=>alive&&epoch===lifetime.current;
    setQueueReady(false);
    void (async()=>{
      const key=await pendingRequestKey(API_URL,userId,'marketing.'+sourceMediaId),raw=await privatePendingStore.get(key);
      if(!isActive())return;queueKey.current=key;
      if(raw&&JSON.parse(raw)?.body?.kind==='APPROVE'){
        const journal=await parseMarketingApprovalJournal(raw);if(journal.body.sourceMediaId!==sourceMediaId||journal.body.listingId!==(listingId??null))throw new Error('MARKETING_CONTEXT_CHANGED');
        if(!isActive())return;approvalOriginal.current=raw;setApprovalDetails(journal.body);setRefreshNeeded(true);setExpanded(true);setEnabled(true);running.current=true;setBusy(true);
        try{await settleApproval(await readMarketingApproval(token,raw),raw,isActive);}catch{if(isActive())setError(approvalConfirmed.current?'原確認回執已核對，商品畫面仍需讀取；不會再次套用。':'原套用結果仍待確認；保留原選圖與文案，不會再次套用。');}
        finally{if(isActive()){running.current=false;setBusy(false);}}
        if(isActive())setQueueReady(true);return;
      }
      if(raw){const journal=await parseMarketingQueueJournal(raw);if(journal.body.sourceMediaId!==sourceMediaId||journal.body.listingId!==(listingId??null))throw new Error('MARKETING_CONTEXT_CHANGED');
        if(!isActive())return;queueOriginal.current=raw;setQueuePending(raw);setQueueDetails(journal.body);setExpanded(true);setEnabled(true);
        try{await settleQueue(await readMarketingQueue(token,raw),raw,isActive);}catch{if(isActive())setError('原行銷排隊結果仍待查核；不會自動重送。');}
        if(isActive())setQueueReady(true);return;
      }
      const [access,latest]=await Promise.all([api<{available:boolean}>(token,'/marketing/availability'),api<{job:{id:string;status:string}|null}>(token,`/marketing/jobs?sourceMediaId=${sourceMediaId}`)]);
      if(!isActive())return;
      if(typeof access.available!=='boolean'||!latest||!Object.hasOwn(latest,'job'))throw new Error('MARKETING_READ_INVALID');
      if(latest.job){const value=await api<unknown>(token,`/marketing/jobs/${latest.job.id}`);if(!isActive())return;setJob(parseMarketingJob(value,sourceMediaId,listingId??null,latest.job.id));}
      setEnabled(access.available);setQueueReady(true);setError('');
    })().catch(()=>{if(isActive()){setEnabled(true);setError('無法安全讀取行銷工作或本機紀錄；請重新查核，不會建立新工作。');}});
    return () => { alive = false; };
  }, [token, userId, sourceMediaId,listingId,readTick]);
  useEffect(() => {
    if (!job || !['PENDING', 'PROCESSING'].includes(job.status)) return;
    let alive = true;
    let timer:number;const controller=new AbortController();
    const poll=async()=>{try{const value=await api<unknown>(token,`/marketing/jobs/${job.id}`,{signal:controller.signal});if(alive)setJob(parseMarketingJob(value,sourceMediaId,listingId??null,job.id));}
      catch{if(alive)setError('排隊狀態暫時無法讀取；資料仍安全保存。');}
      finally{if(alive)timer=window.setTimeout(()=>void poll(),3000);}};
    timer=window.setTimeout(()=>void poll(),3000);
    return () => { alive = false; window.clearTimeout(timer);controller.abort(); };
  }, [token, job?.id, job?.status]);
  useEffect(() => { if (!job || !['REVIEW', 'COMPLETED'].includes(job.status)) return;
    setCopy(job.copy ?? ''); setSelected(job.selectedMediaIds?.length
      ? job.selectedMediaIds : job.generatedMedia.map(media => media.id));
    setNotice(old => old === '免費調整已排隊；未勾選的照片保留。' ? '調整結果已交付；請選用新版或保留原版，再確認照片與文案。' : old);
  }, [job?.id, job?.status]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  if (!enabled) return null;
  const deadline = job?.deliveredAt ? Date.parse(job.deliveredAt) + 7 * 86_400_000 : 0;
  const remaining = Math.max(0, deadline - now);
  const mayAdjust = !!job && !job.parentJobId && ['REVIEW', 'COMPLETED'].includes(job.status) && remaining > 0;
  const selectionLocked = busy || refreshNeeded || !!queuePending || !queueReady || job?.status === 'COMPLETED';
  async function settleQueue(result:MarketingQueueResult,raw:string,isActive:()=>boolean){
    if(!isActive())return;queueConfirmed.current=result;
    if(result.job){const value=await api<unknown>(token,`/marketing/jobs/${result.job.id}`);if(!isActive())return;const restored=parseMarketingJob(value,sourceMediaId,listingId??null,result.job.id);
      if(restored.parentJobId!==result.job.parentJobId)throw new Error('MARKETING_CONTEXT_CHANGED');setJob(restored);}
    if(!isActive())return;
    try{const cleared=await privatePendingStore.clear(queueKey.current,raw);if(!isActive())return;
      if(!cleared&&await privatePendingStore.get(queueKey.current)!==null)throw new Error('MARKETING_CLEANUP_PENDING');
      if(!isActive())return;queueOriginal.current='';queueConfirmed.current=null;setQueuePending('');setQueueDetails(null);setQueueCleanup(false);setCancelConfirm(false);
      setNotice(result.state==='ABANDONED'?'原排隊操作已取消；未建立新工作。':result.job?'已核對原行銷工作；沒有另建工作或再扣次數。':'原工作已不存在；已核對原回執，不會重建。');setError('');
    }catch{if(isActive()){setQueueCleanup(true);setError('原結果已確認，但本機紀錄尚未清理；只重試清理，不會重送。');}}
  }
  async function recoverQueue(mode:'read'|'retry'|'cancel'|'clear'){
    if(running.current||!active.current||!queueOriginal.current)return;running.current=true;setBusy(true);setError('');
    const raw=queueOriginal.current,epoch=lifetime.current,isActive=()=>epoch===lifetime.current;
    let release:(()=>void)|null=null;
    try{
      if(mode==='clear'){if(queueConfirmed.current)await settleQueue(queueConfirmed.current,raw,isActive);return;}
      if(mode==='retry'){release=await beforeApprove();if(!release)throw new Error('HOST_EDIT_PENDING');}
      if(!isActive())return;
      const result=mode==='cancel'?await abandonMarketingQueue(token,raw,isActive):mode==='retry'?await sendMarketingQueue(token,raw,privatePendingStore,queueKey.current,isActive):await readMarketingQueue(token,raw);
      await settleQueue(result,raw,isActive);
    }catch(failure){if(isActive())setError(failure instanceof ApiFailure&&failure.code==='MONTHLY_LIMIT'?'免費版每月 3 次已用完。尊榮版每月 100 次、10 次包 US$1 尚待付款驗證開放。原操作仍保留，可查核或取消。':'原排隊結果仍待查核；保留原內容與識別碼，不會另建工作。');}
    finally{release?.();running.current=false;if(isActive())setBusy(false);}
  }
  async function queue(body:MarketingQueueBody,isActive:()=>boolean){
    const raw=await marketingQueueJournal(body);if(!isActive())return;
    await privatePendingStore.save(queueKey.current,raw);if(!isActive())return;
    queueOriginal.current=raw;setQueuePending(raw);setQueueDetails(body);setNotice('');
    await settleQueue(await sendMarketingQueue(token,raw,privatePendingStore,queueKey.current,isActive),raw,isActive);
  }
  async function start() {
    if (running.current || !active.current || !queueReady || queueOriginal.current || refreshNeeded) return;
    running.current = true;
    setBusy(true); setError('');
    const epoch=lifetime.current,isActive=()=>epoch===lifetime.current;let release:(()=>void)|null=null;
    try {
      if (!await beforeStart()) { if (active.current) setError('請先儲存並確認商品名稱、說明與售價。'); return; }
      if (!active.current) return;
      release=await beforeApprove();if(!release)throw new Error('HOST_EDIT_PENDING');if(!isActive())return;
      await queue({kind:'CREATE',sourceMediaId,listingId:listingId??null,expectedVersion:getExpectedVersion()},isActive); }
    catch (failure) { if (isActive()) setError(failure instanceof ApiFailure && failure.code === 'MONTHLY_LIMIT'
      ? '免費版每月 3 次已用完。尊榮版每月 100 次、10 次包 US$1 尚待付款驗證開放。'
      : queueOriginal.current?'排隊回覆尚未確認，不代表失敗；請查核原工作，不要重新生成。':'無法安全保存排隊操作；請先儲存商品並重試，不會在未記錄時送出。'); }
    finally { release?.();running.current = false; if (isActive()) setBusy(false); }
  }
  async function settleApproval(result:MarketingApprovalResult,raw:string,isActive:()=>boolean,held=false,accept=false){
    if(!isActive())return;approvalConfirmed.current=result;setApprovalResult(result);
    if(result.state!=='APPLIED'&&!accept){setError(result.state==='CONFLICT'?'原確認未套用：商品或選图已變更。請核對原文案，再讀取後台結果。':'原確認已取消；晚到的原請求不會套用。請核對原文案，再讀取後台結果。');return;}
    let release:(()=>void)|null=null;
    try{
      if(!held){release=await beforeApprove();if(!release)throw new Error('HOST_EDIT_PENDING');}
      if(!isActive())return;
      const original=await parseMarketingApprovalJournal(raw);
      const target=result.state==='APPLIED'?{job:{id:original.body.jobId}}:await api<{job:{id:string}|null}>(token,`/marketing/jobs?sourceMediaId=${sourceMediaId}`);
      if(!isActive())return;
      let restored:MarketingJob|null=null;
      if(target.job){try{restored=parseMarketingJob(await api<unknown>(token,`/marketing/jobs/${target.job.id}`),sourceMediaId,listingId??null,target.job.id);}
        catch(failure){if(!(failure instanceof ApiFailure&&failure.status===404))throw failure;}}
      if(!isActive())return;await onApproved();if(!isActive())return;
      const cleared=await privatePendingStore.clear(queueKey.current,raw);
      if(!isActive())return;if(!cleared&&await privatePendingStore.get(queueKey.current)!==null)throw new Error('MARKETING_CLEANUP_PENDING');
      if(!isActive())return;setJob(restored);approvalOriginal.current='';approvalConfirmed.current=null;setApprovalDetails(null);setApprovalResult(null);setApprovalCancel(false);setRefreshNeeded(false);setError('');
      setNotice(result.state==='APPLIED'?`已核對原確認回執（當時版本 ${result.appliedVersion}）；沒有再次套用。商品目前內容可能已有後續更新。`:'已讀取後台並結束原確認操作；沒有套用或刪除照片。');
    }finally{release?.();}
  }
  async function approve(){
    if(running.current||!active.current||refreshNeeded||queueOriginal.current||!queueReady)return;
    if(!job||!selected.length){setError('請至少選一張行銷圖。');return;}
    running.current=true;setBusy(true);setError('');setNotice('');
    const epoch=lifetime.current,isActive=()=>epoch===lifetime.current;let release:(()=>void)|null=null;
    try{
      release=await beforeApprove();if(!release){if(isActive())setError('請先完成或查核商品儲存；未儲存的修改不會被行銷結果覆蓋。');return;}
      if(!isActive())return;
      const body:MarketingApprovalBody={kind:'APPROVE',jobId:job.id,sourceMediaId,listingId:listingId??null,expectedVersion:getExpectedVersion(),selectedMediaIds:[...selected],copy};
      const raw=await marketingApprovalJournal(body);await privatePendingStore.save(queueKey.current,raw);if(!isActive())return;
      approvalOriginal.current=raw;setApprovalDetails((await parseMarketingApprovalJournal(raw)).body);setRefreshNeeded(true);
      await settleApproval(await sendMarketingApproval(token,raw,privatePendingStore,queueKey.current,isActive),raw,isActive,true);
    }catch{if(isActive())setError(approvalConfirmed.current?'原確認回執已核對，商品畫面仍需讀取；不會再次套用。':approvalOriginal.current?'套用回覆尚未確認，不代表失敗；原選圖與文案已保留，重開只查核，不會重送。':'無法安全保存原確認內容；不會在未記錄時套用，請檢查文案與商品儲存。');}
    finally{release?.();running.current=false;if(isActive())setBusy(false);}
  }
  async function recoverApproval(mode:'read'|'retry'|'cancel'|'accept'){
    if(running.current||!active.current||!approvalOriginal.current)return;
    running.current=true;setBusy(true);setError('');const raw=approvalOriginal.current,epoch=lifetime.current,isActive=()=>epoch===lifetime.current;
    let release:(()=>void)|null=null;
    try{
      if(mode==='retry'){release=await beforeApprove();if(!release)throw new Error('HOST_EDIT_PENDING');if(!isActive())return;}
      const result=mode==='accept'?approvalConfirmed.current:mode==='cancel'?await abandonMarketingApproval(token,raw,isActive):mode==='retry'?await sendMarketingApproval(token,raw,privatePendingStore,queueKey.current,isActive):await readMarketingApproval(token,raw);
      if(!result)throw new Error('NO_APPROVAL_PROOF');await settleApproval(result,raw,isActive,!!release,mode==='accept');
    }catch{if(isActive())setError(approvalConfirmed.current?'原確認回執已核對，商品畫面仍需讀取；不會再次套用。':'原套用結果仍待確認；保留原選圖與文案，不會再次套用。');}
    finally{release?.();running.current=false;if(isActive())setBusy(false);}
  }
  async function revise() {
    if (running.current || !active.current || refreshNeeded || queueOriginal.current || !queueReady) return;
    if (!job || !slots.length || adjustment.trim().length < 3) { setError('請勾選照片並描述要調整的地方。'); return; }
    running.current = true; setBusy(true); setError('');
    const epoch=lifetime.current,isActive=()=>epoch===lifetime.current;let release:(()=>void)|null=null;
    try {release=await beforeApprove();if(!release)throw new Error('HOST_EDIT_PENDING');if(!isActive())return;
      await queue({kind:'REVISION',sourceMediaId,listingId:listingId??null,parentJobId:job.id,prompt:adjustment,slots},isActive);
      if(isActive()&&!queueOriginal.current)setNotice('免費調整已排隊；未勾選的照片保留。'); }
    catch { if (isActive()) setError(queueOriginal.current?'免費調整回覆尚未確認，不代表失敗；請查核原調整工作。':'無法安全保存免費調整操作；不會在未記錄時送出。'); }
    finally { release?.();running.current = false; if (isActive()) setBusy(false); }
  }
  const choices = [...(job?.generatedMedia ?? []), ...(job?.previousMedia ?? [])];
  function toggle(id: string) { if (selectionLocked) return; setSelected(old => {
    if (old.includes(id)) return old.filter(value => value !== id);
    const slot = choices.find(media => media.id === id)?.marketingSlot;
    const at = old.findIndex(value => choices.find(media => media.id === value)?.marketingSlot === slot);
    if (at < 0) return [...old, id];
    const updated = [...old]; updated[at] = id; return updated;
  }); }
  function move(id: string, to: number) { if (selectionLocked) return; setSelected(old => {
    const from = old.indexOf(id);
    if (from < 0 || to < 0 || to >= old.length) return old;
    const updated = [...old]; updated.splice(from, 1); updated.splice(to, 0, id); return updated;
  }); }
  if (!expanded) return <button type="button" aria-expanded={false} aria-label="開啟行銷小助手 Beta"
    className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-left" onClick={() => setExpanded(true)}>
    <span className="rounded-xl bg-orange-600 p-3 text-white" aria-hidden>✦</span><span><span className="block font-semibold">行銷小助手 · Beta</span><span className="text-sm text-stone-600">生成商品圖與文案，提升曝光</span></span><span aria-hidden className="ml-auto">›</span>
  </button>;
  return <section aria-label="行銷小助手 Beta" className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm">
    <button type="button" aria-expanded={true} aria-label="收合行銷小助手 Beta" onClick={() => setExpanded(false)} className="flex w-full justify-between min-h-11 font-semibold">行銷小助手 · Beta<span aria-hidden>⌃</span></button>
    <p className="mt-1 text-stone-600">原始實拍照保留；AI 圖僅為行銷示意，確認前不公開。</p>
    {!queueReady&&<button type="button" disabled={busy} className="mt-3 min-h-11 rounded-xl border px-4" onClick={()=>setReadTick(n=>n+1)}>重新查核行銷工作</button>}
    {queuePending&&<div role="region" aria-label="原行銷排隊操作待確認" className="mt-3 rounded-xl border border-orange-300 p-3">
      <p>保留原操作；重新開頁只查核，不會自動重送或再次扣次數。</p>
      {queueDetails&&<p className="mt-2 whitespace-pre-wrap break-words">{queueDetails.kind==='CREATE'?`原操作：生成四圖；商品版本 ${queueDetails.expectedVersion}`:`原免費調整：圖 ${queueDetails.slots.join('、')}\n${queueDetails.prompt}`}</p>}
      {queueCleanup?<button type="button" disabled={busy} onClick={()=>void recoverQueue('clear')}>只重試清理原行銷紀錄</button>:<>
        <button type="button" disabled={busy} onClick={()=>void recoverQueue('read')}>查核原排隊結果</button>
        <button type="button" disabled={busy} onClick={()=>void recoverQueue('retry')}>以相同識別碼重試原排隊</button>
        {!cancelConfirm?<button type="button" disabled={busy} onClick={()=>setCancelConfirm(true)}>取消未建立的原排隊</button>:<><p>若工作已建立，只回讀原結果；不會撤銷已建立工作或刪除照片。</p><button type="button" disabled={busy} onClick={()=>void recoverQueue('cancel')}>確認取消未建立工作</button><button type="button" disabled={busy} onClick={()=>setCancelConfirm(false)}>返回查核</button></>}
      </>}
    </div>}
    {!job || job.status === 'FAILED' ? <button type="button" disabled={busy||!queueReady||!!queuePending||refreshNeeded} onClick={() => void start()}
      className="mt-3 min-h-11 rounded-xl bg-orange-600 px-4 font-semibold text-white">{job ? '重新排隊生成四圖' : '生成四張行銷圖'}</button>
      : ['PENDING', 'PROCESSING'].includes(job.status) ? <p role="status" className="mt-3 text-orange-900">
        {job.status === 'PENDING' ? '已排隊，稍後自動更新' : '正在生成四張圖片與文案'}</p>
        : <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{job.generatedMedia.map(media => <button key={media.id}
            type="button" role="checkbox" aria-label={`選用圖 ${media.marketingSlot} · ${selected.includes(media.id) ? '已選用' : '未選用'} · AI 示意`} disabled={selectionLocked} aria-checked={selected.includes(media.id)} onClick={() => toggle(media.id)} className="rounded-xl border bg-white p-2 text-left">
            <PrivatePhoto id={media.id} token={token} /><span>{selected.includes(media.id) ? '☑ 選用' : '☐ 不選用'} · AI 示意</span>
          </button>)}</div>
          {!!job.previousMedia?.length && <div className="mt-4"><p>{job.status==='COMPLETED'?'調整前的照片（已確認選用狀態）':'調整前的照片（可點選保留原版）'}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{job.previousMedia.map(media => <button key={media.id}
              type="button" role="checkbox" disabled={selectionLocked} aria-checked={selected.includes(media.id)} onClick={() => toggle(media.id)}
              className="rounded-xl border bg-white p-2 text-left"><PrivatePhoto id={media.id} token={token} />
              <span>{selected.includes(media.id) ? '☑ 保留原版' : '☐ 選原版'} · 圖 {media.marketingSlot}</span>
            </button>)}</div></div>}
          {!!selected.length && <div className="mt-4"><p className="font-semibold">{job.status==='COMPLETED'?'此工作確認時的順序（第一張為封面）':'拖放公開順序（第一張為封面）'}</p><p id={`sort-help-${sourceMediaId}`} className="text-stone-600">{job.status==='COMPLETED'?'此工作當時的排序僅供閱覽；商品目前可能已由後續調整更新。':'拖動右側把手；也可聚焦把手後按鍵盤上下方向鍵調整。'}</p>
            {job.status === 'COMPLETED' && <p className="mt-1 text-stone-600">此工作已確認，照片與順序僅供閱覽；如仍有免費調整機會，可在下方另行提出。</p>}
            <ol ref={sortList}>{selected.map((id, index) => <li key={id} className={`mt-2 flex items-center gap-3 rounded-xl border p-3 ${dragging === id ? 'bg-orange-100 ring-2 ring-orange-400' : 'bg-white'}`}>
              <span className="flex-1">{index === 0 ? '封面' : index + 1}. 圖 {choices.find(media => media.id === id)?.marketingSlot}</span>
              <button type="button" disabled={selectionLocked} aria-label={`拖放圖 ${choices.find(media => media.id === id)?.marketingSlot}，目前第 ${index + 1} 張`} aria-describedby={`sort-help-${sourceMediaId}`}
                className="min-h-11 cursor-grab touch-none rounded-lg border px-3 active:cursor-grabbing"
                onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); move(id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}
                onPointerDown={event => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(id); }}
                onPointerUp={event => {
                  if (!dragging || busy) return;
                  const items = [...(sortList.current?.children ?? [])];
                  const centers = items.map(element => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; });
                  const to = centers.reduce((nearest, center, at) => Math.abs(event.clientY - center) < Math.abs(event.clientY - centers[nearest]) ? at : nearest, 0);
                  move(id, to); setDragging(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => setDragging(null)}>☰ 拖放排序</button>
            </li>)}</ol><p role="status" className="sr-only">目前照片順序：{selected.map(id => `圖 ${choices.find(media => media.id === id)?.marketingSlot}`).join('、')}</p></div>}
          <label className="mt-4 block">{job.status==='COMPLETED'?'行銷文案（已套用，只讀）':'行銷文案（可修改後確認）'}<textarea aria-label="編輯行銷文案"
            className="mt-1 min-h-28 w-full rounded-xl border p-3" maxLength={1200} disabled={selectionLocked} value={copy} onChange={event => setCopy(event.target.value)} /></label>
          {job.status === 'REVIEW' && <button type="button" disabled={busy || refreshNeeded || !!queuePending || !queueReady || job.generatedMedia.length !== 4}
            onClick={() => void approve()} className="mt-3 min-h-11 rounded-xl bg-orange-600 px-4 font-semibold text-white">確認照片與文案</button>}
          {mayAdjust && <div className="mt-4 border-t pt-3"><p className="font-semibold text-red-700">免費調整剩餘 {Math.floor(remaining / 86_400_000)}天 {Math.floor(remaining % 86_400_000 / 3_600_000)}時 {Math.floor(remaining % 3_600_000 / 60_000)}分</p>
            <p className="mt-2">勾選要重新生成的圖片（最多一次）</p><div className="mt-2 flex gap-3">{[1, 2, 3, 4].map(slot => <label key={slot}>
              <input type="checkbox" disabled={busy || refreshNeeded || !!queuePending || !queueReady} checked={slots.includes(slot)} onChange={event => setSlots(old => event.target.checked ? [...old, slot] : old.filter(value => value !== slot))} /> 圖 {slot}</label>)}</div>
            <input aria-label="描述要調整的地方" disabled={busy || refreshNeeded || !!queuePending || !queueReady} className="mt-3 w-full rounded-xl border p-3" maxLength={500} placeholder="例如：改成更明亮的背景" value={adjustment} onChange={event => setAdjustment(event.target.value)} />
            <button type="button" disabled={busy || refreshNeeded || !!queuePending || !queueReady} onClick={() => void revise()} className="mt-3 min-h-11 rounded-xl border px-4">免費調整一次</button>
          </div>}
        </>}
    {refreshNeeded&&approvalDetails&&<div role="region" aria-label="原行銷確認操作待查核" className="mt-3 rounded-xl border border-orange-300 p-3">
      <p>原選用 {approvalDetails.selectedMediaIds.length} 張 · 原商品版本 {approvalDetails.expectedVersion}；重新開頁只查核原回執，不會自動重送。</p>
      <p className="mt-2 whitespace-pre-wrap break-words">原文案：{approvalDetails.copy}</p>
      <p className="mt-2">原照片順序：{approvalDetails.selectedMediaIds.map((id,index)=>`第${index+1}張${choices.find(m=>m.id===id)?`（圖 ${choices.find(m=>m.id===id)!.marketingSlot}）`:'（待讀取原工作）'}`).join(' → ')}</p>
      {approvalResult?<><p className="mt-2">{approvalResult.state==='APPLIED'?`原操作已套用，當時版本 ${approvalResult.appliedVersion}；後續商品編輯不會改變此回執。`:approvalResult.state==='CONFLICT'?'原操作未套用；商品或選图已變更。':'原操作已取消，不代表撤回其他已套用工作。'}</p>
        <button type="button" disabled={busy} className="mt-2 min-h-11 rounded-xl border px-3" onClick={()=>void recoverApproval('accept')}>{approvalResult.state==='APPLIED'?'只重新讀取商品並清理原確認紀錄':'讀取後台並結束原確認操作'}</button></>:
        <><button type="button" disabled={busy} className="mt-2 min-h-11 rounded-xl border px-3" onClick={()=>void recoverApproval('read')}>查核原行銷套用結果</button>
          <button type="button" disabled={busy} className="mt-2 min-h-11 rounded-xl border px-3" onClick={()=>void recoverApproval('retry')}>以相同識別碼重試原確認</button>
          {!approvalCancel?<button type="button" disabled={busy} className="mt-2 min-h-11 rounded-xl border px-3" onClick={()=>setApprovalCancel(true)}>取消未套用的原確認</button>:<><p>只阻止尚未套用的原請求；已套用則回讀原回執，不回復商品或刪除照片。</p><button type="button" disabled={busy} onClick={()=>void recoverApproval('cancel')}>確認取消未套用操作</button><button type="button" disabled={busy} onClick={()=>setApprovalCancel(false)}>返回查核</button></>}
        </>}
    </div>}
    {notice && <p role="status" className="mt-2 text-green-800">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </section>;
}
