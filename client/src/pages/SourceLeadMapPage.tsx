import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
type Lead = { id:string; title:string; summary:string; canonicalUrl:string; publicPlaceName:string; publicAddress:string; latitude:number; longitude:number; stockStatus:string; checkedAt:string; postedEarliestAt:string; postedLatestAt:string; publicFacts?:{priceText:string;originalDateLabel:string;sourceAccessNotice:string} };
type Room = { id:string; available:boolean; state:string; transferHash:string; events:{action:string;text?:string}[]; delivered:boolean };
export const mapPoint = (latitude:number, longitude:number) => ({x:((longitude+180)/360*128-106)*256,y:((1-Math.asinh(Math.tan(latitude*Math.PI/180))/Math.PI)/2*128-53)*256});
export function currentLead(lead:Lead, now=Date.now()) {
 const [year,month,day]=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)).split('-').map(Number);
 const first=new Date(Date.UTC(year,month-3,1));const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();const cutoff=Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,end))-8*3600000;
 const lower=Date.parse(lead.postedEarliestAt),upper=Date.parse(lead.postedLatestAt),checked=Date.parse(lead.checkedAt);
 return Number.isFinite(lower)&&Number.isFinite(upper)&&Number.isFinite(checked)&&lower>=cutoff&&lower<=upper&&upper<=now&&checked<=now&&now-checked<=48*3600000;
}
export default function SourceLeadMapPage() {
 const {token,user}=useAuth(); const [params,setParams]=useSearchParams(); const [items,setItems]=useState<Lead[]>([]); const [error,setError]=useState(''); const [room,setRoom]=useState<Room|null>(null); const [question,setQuestion]=useState(''); const [busy,setBusy]=useState(false); const [loaded,setLoaded]=useState(false);
 const selected=items.find(i=>i.id===params.get('id'))??items[0];
 const scope=`${token??'anonymous'}:${selected?.id??''}`; const currentScope=useRef(scope);currentScope.current=scope;
 const requestBusy=useRef(''); const draftScope=useRef(''); const privateScope=useRef('');const pending=useRef<{scope:string;payload:Record<string,unknown>}|null>(null);
 const privateRoom=privateScope.current===scope?room:null; const draft=draftScope.current===scope?question:'';
 const journalKey=`source-lead-request:${user?.id??'unavailable'}:${selected?.id??''}`;
 const savedRequest=()=>{try{const x=JSON.parse(sessionStorage.getItem(journalKey)??'null');return x&&typeof x.requestId==='string'&&['ASK','CONSENT','CANCEL'].includes(x.action)?x:null;}catch{return null}};
 useEffect(()=>{let stopped=false;let loading=false;async function refresh(){if(loading)return;loading=true;try{const all:Lead[]=[];let cursor:string|null=null;const seen=new Set<string>();do{const r=await fetch(`${API_URL}/source-leads${cursor?'?cursor='+encodeURIComponent(cursor):''}`);if(!r.ok)throw Error('來源暫時無法讀取');const data=await r.json();if(!Array.isArray(data.items))throw Error('來源回應無效');all.push(...data.items);cursor=data.nextCursor;if(cursor&&seen.has(cursor))throw Error('分頁未前進');if(cursor)seen.add(cursor);}while(cursor);if(!stopped){setItems(all.filter(r=>currentLead(r)));setLoaded(true);setError('');}}catch(e){if(!stopped){setItems([]);setLoaded(false);setError((e as Error).message);}}finally{loading=false;}}
 const foreground=()=>{if(document.visibilityState==='visible')void refresh()};void refresh();const timer=setInterval(()=>void refresh(),30000);document.addEventListener('visibilitychange',foreground);return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',foreground)};},[]);
 useEffect(()=>{setRoom(null);setQuestion('');setBusy(false);privateScope.current='';pending.current=null;},[scope]);
 async function action(kind:'ASK'|'CONSENT'|'CANCEL'|'READ') {
  if(!selected||!token||busy||requestBusy.current===scope)return;requestBusy.current=scope;const requestScope=scope;const id=selected.id;const auth=token;setBusy(true);setError('');
  const current=()=>currentScope.current===requestScope;
  async function request(path:string,body?:unknown,actionPost=false){const r=await fetch(`${API_URL}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Object.assign(Error('操作未完成，請讀取最新收件狀態；不代表已送給賣家'),{httpStatus:r.status,actionPost});return r.json();}
  try{
   let existing:Room|null=await request(`/source-leads/${id}/inquiry`);if(!current())return;
   const priorJournal=savedRequest();
   if(!existing){privateScope.current=requestScope;setRoom(null);if(kind==='READ'){setError(priorJournal?'上次操作結果仍待確認；請勿新增重複問題':'尚無已存詢問；填寫內容後按保存問題才會建立');return;}if(kind!=='ASK'||priorJournal)throw Error('尚無可處理的詢問，請讀取確認；不建立重複紀錄');await request(`/source-leads/${id}`);existing=await request(`/source-leads/${id}/inquiry`,{});if(!current())return;}
   if(!existing)throw Error("收件回應無效，請讀取確認；不重送");
   let active:Room=existing;
   privateScope.current=requestScope;setRoom(active);
   const journal=savedRequest();if(journal&&active.events.some((e:any)=>e.requestId===journal.requestId)){sessionStorage.removeItem(journalKey);pending.current=null;setQuestion('');if(kind!=='CANCEL')return;}
   if(kind==='READ'){if(journal)setError('上次操作結果仍待確認；可重新讀取或撤回，請勿新增重複問題');return;}
   if(journal&&!pending.current&&kind!=='CANCEL')throw Error('上次操作結果待確認，請讀取已存詢問或撤回；不重送新問題');
   if(pending.current?.scope===requestScope){const old=pending.current.payload;if(active.events.some((e:any)=>e.requestId===old.requestId)){pending.current=null;setQuestion('');return;}if(old.action!==kind&&kind!=='CANCEL')throw Error('上次操作結果待確認，請先重試同一操作');}
   if(kind==='CONSENT'&&!pending.current&&privateRoom?.transferHash!==active.transferHash)throw Error('問題內容已更新，請重新閱讀後再次確認同意');
   if(kind!=='CANCEL')await request(`/source-leads/${id}`);
   const payload=pending.current?.scope===requestScope&&pending.current.payload.action===kind?pending.current.payload:kind==='ASK'?{requestId:crypto.randomUUID(),action:kind,text:draft}:kind==='CONSENT'?{requestId:crypto.randomUUID(),action:kind,consent:true,transferHash:active.transferHash}:{requestId:crypto.randomUUID(),action:kind};
   pending.current={scope:requestScope,payload};sessionStorage.setItem(journalKey,JSON.stringify({requestId:payload.requestId,action:payload.action}));
   active=await request(`/source-leads/${id}/inquiry/${active.id}/actions`,payload,true);
   if(!current())return;privateScope.current=requestScope;setRoom(active);pending.current=null;sessionStorage.removeItem(journalKey);if(kind==='ASK')setQuestion('');
  }catch(e){if(current()){const status=(e as Error&{httpStatus?:number}).httpStatus;if((e as Error&{actionPost?:boolean}).actionPost&&status&&status>=400&&status<500){pending.current=null;sessionStorage.removeItem(journalKey);}setError((e as Error).message);}}finally{if(requestBusy.current===requestScope)requestBusy.current='';if(current())setBusy(false);}
 }
 const points=Array.from(new Map(items.map(i=>[`${i.latitude},${i.longitude}`,i])).values());
 return <main className="max-w-6xl mx-auto p-4 space-y-4"><h1 className="text-2xl font-bold">來源線索地圖</h1><p>庫存、圖文權利與交易仍待確認；來源線索不計入已驗證商品達成率。公共面交點不是賣家或現貨所在地。</p><p>{loaded?`${items.length} 件來源線索・${points.length} 個公共地點`:'讀取中…'}</p>{error&&<p role="alert">{error}</p>}
 <div className="grid md:grid-cols-2 gap-4"><div><div className="relative overflow-hidden border rounded" style={{aspectRatio:'2/3'}} aria-label="台灣來源線索位置地圖"><svg viewBox="0 0 512 768" role="img" aria-label="OpenStreetMap 台灣公共地點"><title>公共地點來源線索地圖</title>{[106,107].flatMap(x=>[53,54,55].map(y=><foreignObject key={`${x}-${y}`} x={(x-106)*256} y={(y-53)*256} width="256" height="256"><img alt="" referrerPolicy="origin" src={`https://tile.openstreetmap.org/7/${x}/${y}.png`} width="256" height="256" /></foreignObject>))}{points.map(i=>{const p=mapPoint(i.latitude,i.longitude);const count=items.filter(j=>j.latitude===i.latitude&&j.longitude===i.longitude).length;return <g key={i.id} role="button" tabIndex={0} aria-label={i.publicPlaceName} onClick={()=>setParams({id:i.id})} onKeyDown={e=>{if(e.key==='Enter')setParams({id:i.id})}}><circle cx={p.x} cy={p.y} r="9" fill="#2563eb"/><text x={p.x+12} y={p.y} fontSize="12" fill="#111">{count}件</text></g>;})}</svg></div><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><p>地圖位置依公開來源座標；精度未知，實際地點仍應向原賣家確認。</p></div>
 <div className="space-y-3"><label>選擇線索 <select className="w-full border p-2" value={selected?.id??''} onChange={e=>setParams({id:e.target.value})}>{items.map(i=><option key={i.id} value={i.id}>{i.title} — {i.publicPlaceName}</option>)}</select></label>{selected&&<><h2 className="text-xl font-bold">{selected.title}</h2><p>{selected.summary}</p><p>{selected.publicPlaceName}：{selected.publicAddress}</p><p>{selected.publicFacts?.priceText}</p><p>{selected.publicFacts?.originalDateLabel}</p><p>{selected.publicFacts?.sourceAccessNotice}</p><a className="underline" href={selected.canonicalUrl} target="_blank" rel="noreferrer">查看原始來源</a><h3>委託詢問</h3><p>只保存你的問題；確認原賣家聯絡路由後才能人工轉交。不建立訂單或承諾有貨。</p>{!token?<Link to="/login">登入後詢問</Link>:<><button disabled={busy} onClick={()=>action('READ')}>讀取已存詢問</button><textarea className="w-full border p-2" aria-label="詢問內容" maxLength={1500} value={draft} onChange={e=>{draftScope.current=scope;setQuestion(e.target.value)}} disabled={busy||!!privateRoom&&privateRoom.state!=='INQUIRY'}/><button disabled={busy||!draft.trim()||!!privateRoom&&privateRoom.state!=='INQUIRY'} onClick={()=>action('ASK')}>保存問題</button>{privateRoom&&<><p>詢問編號：{privateRoom.id} · {privateRoom.state} · {privateRoom.state==='DELIVERY_REQUIRES_REVIEW'?'送達證據待人工審查':privateRoom.delivered?'已人工轉交':'尚未送給賣家'}</p>{privateRoom.events.filter(e=>e.action==='ASK').map((e,i)=><p key={i}>{e.text}</p>)}{privateRoom.state==='INQUIRY'&&privateRoom.events.some(e=>e.action==='ASK')&&<button disabled={busy} onClick={()=>action('CONSENT')}>同意只轉交上列問題給核實的原賣家</button>}{['INQUIRY','WAITING_ROUTE','TRANSFER_RESERVED'].includes(privateRoom.state)&&<button disabled={busy} onClick={()=>action('CANCEL')}>撤回委託</button>}</>}</>}</>}</div></div></main>;
}
