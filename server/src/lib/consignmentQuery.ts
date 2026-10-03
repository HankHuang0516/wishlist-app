import { parseLead, digest, ref } from './sourceLeadRules';
import { isListingId } from './listingRules';
export type QueryInput={query:string;ids:string[];archiveId:string|null;terms:string[]};
export function parseConsignmentQuery(body:unknown):QueryInput {
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='query'))throw Error('INVALID_QUERY');
 const q=(body as any).query;if(typeof q!=='string'||!q.trim()||q.length>500||/[\x00-\x1f\x7f]/.test(q))throw Error('INVALID_QUERY');
 const ids=[...new Set((q.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[]) as string[])].map(x=>x.toLowerCase());
 const archive=q.match(/\bFB\d+-\d+-\d+\b/)?.[0]??null;
 if(ids.length>5||(/商品\s*(?:ID|識別碼)\s*[:：]?/i.test(q)&&!ids.length&&!archive))throw Error('INVALID_QUERY');
 const stripped=q.replace(/幫我|請問|查詢|查看|找出|全部|所有|自己的|我的|代售|來源|詢問|商品|對話|聊天|記錄|紀錄|面交|碰面|取貨|約定|預約|時間|地點|在哪裡|在哪|哪裡|何時|什麼時候|是否|已確認|確認|提議|改約|取消|資訊|現在|目前|最後|最新|請|找|的|是|了|呢|嗎/g,' ');
 return {query:q.trim(),ids,archiveId:archive,terms:ids.length||archive?[]:[...new Set(stripped.split(/[\s，。！？、,:;?]+/).filter((x:string)=>x.length>=2))].slice(0,8) as string[]};
}
// Archive/source provenance + server-owned proxy inquiry/consent receipts.
// A buyer ID or an external record alone never grants consignment eligibility.
export function consignmentEligible(row:any):boolean {
 try {
  const l=row.lead;if(!l||row.leadId!==l.id||!isListingId(row.id)||!isListingId(l.id)||row.leadContentHash!==l.contentHash)return false;
  const evidence={...l.evidence};delete evidence.withdrawalRef;
  const input={...Object.fromEntries(['archiveItemId','libraryFileId','archiveVersion','archiveSha256','title','summary','canonicalUrl','county','district','publicPlaceName','publicAddress','latitude','longitude'].map(k=>[k,l[k]])),evidence,postedEarliestAt:l.postedEarliestAt.toISOString(),postedLatestAt:l.postedLatestAt.toISOString(),checkedAt:l.checkedAt.toISOString()};
  if(parseLead(input,l.checkedAt).contentHash!==l.contentHash)return false;
  if(!Array.isArray(row.events)||row.events.length>201||(row.events.length===201&&row.events[200]?.action!=='CANCEL')||!row.events.some((e:any)=>e.action==='ASK'&&typeof e.text==='string'&&e.text.trim()))return false;
  if(row.events.some((e:any)=>!isListingId(e.requestId)||!['ASK','CONSENT','CANCEL','SELLER_REPLY'].includes(e.action)||!Number.isFinite(Date.parse(e.at))))return false;
  // Consent binds a specific question snapshot; cancellation may clear the
  // current consentHash, but historical read authority still cites the receipt.
  return row.events.some((e:any,i:number)=>{
   if(e.consent!==true||!['ASK','CONSENT'].includes(e.action)||!/^[a-f0-9]{64}$/.test(e.payloadHash??''))return false;
   const before=row.events.slice(0,i).filter((x:any)=>x.action==='ASK').map((x:any)=>({requestId:x.requestId,text:x.text}));
   return e.payloadHash===digest({leadId:l.id,contentHash:l.contentHash,canonicalUrl:l.canonicalUrl,questions:before});
  });
 }catch{return false;}
}
export function consignmentMatches(row:any,input:QueryInput){
 if(input.ids.length)return input.ids.includes(row.leadId.toLowerCase());
 if(input.archiveId)return row.lead.archiveItemId===input.archiveId;
 return !input.terms.length||input.terms.some(t=>row.lead.title.toLocaleLowerCase().includes(t.toLocaleLowerCase()));
}
export function consignmentResult(row:any){
 const events=row.events.map((e:any,index:number)=>({messageId:e.requestId,conversationId:row.id,sequence:index+1,action:e.action,text:e.text??null,at:e.at,...(e.action==='SELLER_REPLY'?{inReplyToRoundId:e.reservationId??null,receiptRef:ref(e.receiptRef)?e.receiptRef:null}:{})})).sort((a:any,b:any)=>a.at.localeCompare(b.at)||a.sequence-b.sequence);
 return {kind:'ARCHIVED_AGENT_PROXY_INQUIRY',id:row.id,productId:row.leadId,archiveItemId:row.lead.archiveItemId,title:row.lead.title,canonicalUrl:row.lead.canonicalUrl,archiveBinding:{libraryFileId:row.lead.libraryFileId,version:row.lead.archiveVersion,sha256:row.lead.archiveSha256},state:row.state,
  events,meetup:{status:'UNKNOWN',startsAt:null,placeName:null,reason:'來源詢問尚無結構化雙方確認面交紀錄。原訊息的提議、確認、改約或取消文字僅作引用，不自動視為有效約定。'},
  answer:['CANCELLED','CANCEL_REQUESTED'].includes(row.state)?'代理詢問已取消或要求取消；這不是面交取消或已成交的證明。':'代理詢問紀錄可查閱；是否外送、在售與面交均需另核實。'};
}
