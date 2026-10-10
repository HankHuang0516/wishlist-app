import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/marketplaceApi';
import { isUuid } from '../lib/listingBatch';
import { chatTime } from '../lib/chatCopy';
import { consignmentSummary, consignmentText as text } from '../lib/consignmentCopy';
export type ConsignmentResult={kind:'ARCHIVED_AGENT_PROXY_INQUIRY';id:string;productId:string;archiveItemId:string;title:string;answer:string;state:string;canonicalUrl:string;events:{messageId:string;conversationId:string;sequence:number;action:string;text:string|null;at:string}[];meetup:{status:'UNKNOWN';reason:string}};
export function parseConsignmentResults(data:any):{items:ConsignmentResult[];truncated:boolean}{
 if(!data||data.scope!=='OWN_ARCHIVED_AGENT_PROXY_INQUIRIES'||!Array.isArray(data.items)||data.items.length>25||typeof data.truncated!=='boolean'||data.items.some((r:any)=>r.kind!=='ARCHIVED_AGENT_PROXY_INQUIRY'||!isUuid(r.id)||!isUuid(r.productId)||typeof r.title!=='string'||typeof r.archiveItemId!=='string'||typeof r.answer!=='string'||r.meetup?.status!=='UNKNOWN'||typeof r.meetup.reason!=='string'||!Array.isArray(r.events)||r.events.length>201||r.events.some((e:any)=>!isUuid(e.messageId)||e.conversationId!==r.id||!Number.isSafeInteger(e.sequence)||!['ASK','CONSENT','CANCEL','SELLER_REPLY'].includes(e.action)||!(e.text===null||typeof e.text==='string')||!Number.isFinite(Date.parse(e.at)))))throw Error('Invalid consignment response');return data;
}
export default function ChatQuery({token}:{token:string}) {
 const [query,setQuery]=useState(''),[items,setItems]=useState<ConsignmentResult[]>([]),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[done,setDone]=useState(false),[truncated,setTruncated]=useState(false);
 const generation=useRef(0),controller=useRef<AbortController|null>(null),gate=useRef(false);
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[token]);
 async function submit(event:React.FormEvent){event.preventDefault();if(gate.current)return;gate.current=true;const n=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setIssue('');setItems([]);setDone(false);setTruncated(false);
  try {const data=parseConsignmentResults(await api<unknown>(token,'/chat/query',{method:'POST',body:JSON.stringify({query}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])}));if(n!==generation.current||abort.signal.aborted)return;setItems(data.items);setTruncated(data.truncated);setDone(true);
  }catch{if(n===generation.current)setIssue('failed');}
  finally{if(n===generation.current){gate.current=false;setBusy(false);}}
 }
 return <section aria-labelledby="chat-query-heading" className="space-y-3 rounded-xl border bg-white p-4">
  <h2 id="chat-query-heading" className="font-semibold">{text('title')}</h2><p className="text-sm">{text('explanation')}</p>
  <form onSubmit={submit} className="flex flex-wrap gap-2"><label htmlFor="chat-query" className="sr-only">{text('query')}</label><input id="chat-query" value={query} onChange={e=>setQuery(e.target.value)} maxLength={500} required className="min-h-11 min-w-[12rem] flex-1 rounded border p-2"/><button disabled={busy} type="submit" className="min-h-11 rounded border px-4">{text(busy?'searching':'search')}</button></form>
  {issue&&<p role="alert">{text('failed')}</p>}{done&&!items.length&&<p role="status">{text('empty')}</p>}{truncated&&<p role="status">{text('truncated')}</p>}{items.length>1&&<p>{text('multiple')}</p>}
  {items.map(r=><article key={r.id} data-consignment-product={r.productId} className="space-y-2 border-t pt-3"><h3>{r.title}</h3><p className="break-all">{text('product')}{r.productId} · {text('archive')}{r.archiveItemId}</p><p>{consignmentSummary(r.answer)}</p><p>{text('unknownMeetup')}{consignmentSummary(r.meetup.reason)}</p><Link className="underline" to={'/chat?source='+r.productId}>{text('originalInquiry')}{r.id}</Link><details><summary>{text('citations')}</summary>{r.events.map(m=><blockquote key={m.messageId} className="my-2 break-words border-l pl-2"><p>{m.text??(m.action==='CONSENT'?text('consent'):m.action==='CANCEL'?text('cancel'):m.action)}</p><small className="break-all">{text('inquiry')}{m.conversationId} · {text('message')}{m.messageId} · {m.action} · <time dateTime={m.at}>{chatTime(m.at)}{text('taiwanTime')}</time></small></blockquote>)}</details></article>)}
 </section>;
}
