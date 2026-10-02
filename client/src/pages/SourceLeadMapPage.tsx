import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { sourceLeadText as text } from '../lib/sourceLeadText';
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
 const requestedId=params.get('id');
 const initialTarget=useRef('');
 if(!initialTarget.current&&items[0])initialTarget.current=items[0].id;
 const targetId=requestedId||initialTarget.current;
 const selected=items.find(i=>i.id===targetId);
 const scope=`${token??'anonymous'}:${targetId}`; const currentScope=useRef(scope);currentScope.current=scope;
 const requestBusy=useRef(''); const draftScope=useRef(''); const privateScope=useRef('');const pending=useRef<{scope:string;payload:Record<string,unknown>}|null>(null);
 const privateRoom=privateScope.current===scope?room:null; const draft=draftScope.current===scope?question:'';
 const journalKey=`source-lead-request:${user?.id??'unavailable'}:${targetId}`;
 useEffect(()=>{if(!params.get('id')&&targetId){const next=new URLSearchParams(params);next.set('id',targetId);setParams(next,{replace:true});}},[targetId,params,setParams]);
 const savedRequest=()=>{try{const x=JSON.parse(sessionStorage.getItem(journalKey)??'null');return x&&typeof x.requestId==='string'&&['ASK','CONSENT','CANCEL'].includes(x.action)?x:null;}catch{return null}};
 useEffect(()=>{let stopped=false;let loading=false;async function refresh(){if(loading)return;loading=true;try{const all:Lead[]=[];let cursor:string|null=null;const seen=new Set<string>();do{const r:Response=await fetch(`${API_URL}/source-leads${cursor?'?cursor='+encodeURIComponent(cursor):''}`);if(!r.ok)throw Error(text('readFailed'));const data=await r.json();if(!Array.isArray(data.items))throw Error(text('invalidResponse'));all.push(...data.items);cursor=data.nextCursor;if(cursor&&seen.has(cursor))throw Error(text('cursorStalled'));if(cursor)seen.add(cursor);}while(cursor);if(!stopped){setItems(all.filter(r=>currentLead(r)));setLoaded(true);setError('');}}catch(e){if(!stopped){setItems([]);setLoaded(false);setError((e as Error).message);}}finally{loading=false;}}
 const foreground=()=>{if(document.visibilityState==='visible')void refresh()};void refresh();const timer=setInterval(()=>void refresh(),30000);document.addEventListener('visibilitychange',foreground);return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',foreground)};},[]);
 // Finish resetting the previous scope before the new source can accept input.
 useLayoutEffect(()=>{setRoom(null);setQuestion('');setBusy(false);privateScope.current='';pending.current=null;},[scope]);
 async function action(kind:'ASK'|'CONSENT'|'CANCEL'|'READ') {
  if(!targetId||!token||busy||requestBusy.current===scope||(kind==='ASK'||kind==='CONSENT')&&!selected)return;requestBusy.current=scope;const requestScope=scope;const id=targetId;const auth=token;setBusy(true);setError('');
  const current=()=>currentScope.current===requestScope;
  async function request(path:string,body?:unknown,actionPost=false){const r=await fetch(`${API_URL}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Object.assign(Error(text('operationFailed')),{httpStatus:r.status,actionPost});return r.json();}
  try{
   let existing:Room|null=await request(`/source-leads/${id}/inquiry`);if(!current())return;
   const priorJournal=savedRequest();
   if(!existing){privateScope.current=requestScope;setRoom(null);if(kind==='READ'){setError(priorJournal?text('unknownEmpty'):text('empty'));return;}if(kind!=='ASK'||priorJournal)throw Error(text('noInquiry'));await request(`/source-leads/${id}`);existing=await request(`/source-leads/${id}/inquiry`,{});if(!current())return;}
   if(!existing)throw Error(text('invalidInquiry'));
   let active:Room=existing;
   privateScope.current=requestScope;setRoom(active);
   const journal=savedRequest();if(journal&&active.events.some((e:any)=>e.requestId===journal.requestId)){sessionStorage.removeItem(journalKey);pending.current=null;setQuestion('');if(kind!=='CANCEL')return;}
   if(kind==='READ'){if(journal)setError(text('previousUnknown'));return;}
   if(journal&&!pending.current&&kind!=='CANCEL')throw Error(text('originalUnknown'));
   if(pending.current?.scope===requestScope){const old=pending.current.payload;if(active.events.some((e:any)=>e.requestId===old.requestId)){pending.current=null;setQuestion('');return;}if(old.action!==kind&&kind!=='CANCEL')throw Error(text('retryOriginal'));}
   if(kind==='CONSENT'&&!pending.current&&privateRoom?.transferHash!==active.transferHash)throw Error(text('changed'));
   if(kind!=='CANCEL')await request(`/source-leads/${id}`);
   const payload=pending.current?.scope===requestScope&&pending.current.payload.action===kind?pending.current.payload:kind==='ASK'?{requestId:crypto.randomUUID(),action:kind,text:draft}:kind==='CONSENT'?{requestId:crypto.randomUUID(),action:kind,consent:true,transferHash:active.transferHash}:{requestId:crypto.randomUUID(),action:kind};
   pending.current={scope:requestScope,payload};sessionStorage.setItem(journalKey,JSON.stringify({requestId:payload.requestId,action:payload.action}));
   active=await request(`/source-leads/${id}/inquiry/${active.id}/actions`,payload,true);
   if(!current())return;privateScope.current=requestScope;setRoom(active);pending.current=null;sessionStorage.removeItem(journalKey);if(kind==='ASK')setQuestion('');
  }catch(e){if(current()){const status=(e as Error&{httpStatus?:number}).httpStatus;if((e as Error&{actionPost?:boolean}).actionPost&&status&&status>=400&&status<500){pending.current=null;sessionStorage.removeItem(journalKey);}setError((e as Error).message);}}finally{if(requestBusy.current===requestScope)requestBusy.current='';if(current())setBusy(false);}
 }
 const points=Array.from(new Map(items.map(i=>[`${i.latitude},${i.longitude}`,i])).values());
 return <main className="max-w-6xl mx-auto p-4 space-y-4"><h1 className="text-2xl font-bold">{text('title')}</h1><p>{text('notice')}</p><p>{loaded?text('count',{items:items.length,points:points.length}):text('loading')}</p>{error&&<p role="alert">{error}</p>}
 <div className="grid md:grid-cols-2 gap-4"><div><div className="relative overflow-hidden border rounded" style={{aspectRatio:'2/3'}} aria-label={text('map')}><svg viewBox="0 0 512 768" role="img" aria-label={text('basemap')}><title>{text('mapTitle')}</title>{[106,107].flatMap(x=>[53,54,55].map(y=><foreignObject key={`${x}-${y}`} x={(x-106)*256} y={(y-53)*256} width="256" height="256"><img alt="" referrerPolicy="origin" src={`https://tile.openstreetmap.org/7/${x}/${y}.png`} width="256" height="256" /></foreignObject>))}</svg>{points.map(i=>{const p=mapPoint(i.latitude,i.longitude);const count=items.filter(j=>j.latitude===i.latitude&&j.longitude===i.longitude).length;return <button type="button" key={i.id} className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-blue-700 bg-white px-2 text-sm text-blue-800 focus-visible:outline-muji-primary" style={{left:`${p.x/512*100}%`,top:`${p.y/768*100}%`}} aria-label={i.publicPlaceName} onClick={()=>setParams({id:i.id})}>{text('mapCount',{count})}</button>;})}</div><a className="inline-flex min-h-11 items-center underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><p>{text('locationNotice')}</p></div>
 <div className="space-y-3">
  <label>{text('choose')} <select className="min-h-11 w-full border p-2" value={targetId} onChange={e=>setParams({id:e.target.value})}>
   {targetId&&!selected&&<option value={targetId}>{text('unavailableOption')}</option>}
   {items.map(i=><option key={i.id} value={i.id}>{i.title} — {i.publicPlaceName}</option>)}
  </select></label>
  {selected&&<><h2 className="text-xl font-bold">{selected.title}</h2><p>{selected.summary}</p><p>{selected.publicPlaceName}：{selected.publicAddress}</p><p>{selected.publicFacts?.priceText}</p><p>{selected.publicFacts?.originalDateLabel}</p><p>{selected.publicFacts?.sourceAccessNotice}</p><a className="inline-flex min-h-11 items-center underline" href={selected.canonicalUrl} target="_blank" rel="noreferrer">{text('originalSource')}</a></>}
  {targetId&&!selected&&<p role="status">{text('unavailable')}</p>}
  {targetId&&<><h3>{text('inquiry')}</h3><p>{text('inquiryNotice')}</p>
   {!token?<Link className="inline-flex min-h-11 items-center underline" to="/login">{text('login')}</Link>:<>
    <button className="min-h-11 rounded-md border px-3" disabled={busy} onClick={()=>action('READ')}>{text('read')}</button>
    <textarea className="min-h-24 w-full border p-2" aria-label={text('question')} maxLength={1500} value={draft} onChange={e=>{draftScope.current=scope;setQuestion(e.target.value)}} disabled={busy||!selected||!!privateRoom&&privateRoom.state!=='INQUIRY'}/>
    <button className="min-h-11 rounded-md border px-3" disabled={busy||!selected||!draft.trim()||!!privateRoom&&privateRoom.state!=='INQUIRY'} onClick={()=>action('ASK')}>{text('save')}</button>
    {privateRoom&&<><p className="break-words">{text('receipt',{id:privateRoom.id,state:privateRoom.state,delivery:privateRoom.state==='DELIVERY_REQUIRES_REVIEW'?text('review'):privateRoom.delivered?text('delivered'):text('notDelivered')})}</p>
     {privateRoom.events.filter(e=>e.action==='ASK').map((e,i)=><p key={i}>{e.text}</p>)}
     {privateRoom.state==='INQUIRY'&&privateRoom.events.some(e=>e.action==='ASK')&&<button className="min-h-11 rounded-md border px-3 text-left" disabled={busy||!selected} onClick={()=>action('CONSENT')}>{text('consent')}</button>}
     {['INQUIRY','WAITING_ROUTE','TRANSFER_RESERVED'].includes(privateRoom.state)&&<button className="min-h-11 rounded-md border px-3" disabled={busy} onClick={()=>action('CANCEL')}>{text('cancel')}</button>}
    </>}
   </>}
  </>}
 </div></div></main>;
}
