import { isUuid, parseSellerDraft, sameSellerContent, type SellerDraft, type PublishDetails } from './listingBatch';
import { pendingRequestKey, pendingScope, type privatePendingStore } from './webPendingStore';
type Store = Pick<typeof privatePendingStore,'get'|'clearComposerDraft'|'replaceDraft'|'composerDraftKeys'>;
export type ComposerDraft = {version:1;revision:string;mediaId:string;baseVersion:number;baseDraft:SellerDraft|null;draft:SellerDraft};
export type ComposerSource = {id:string;version:number;serverDraft:SellerDraft|null;draft:SellerDraft};
type Entry = {key:string;raw:string|null;value:ComposerDraft;latest:ComposerSource|null;conflict:boolean;failed:boolean;pending:number;queue:Promise<void>};
const exact=(value:any,keys:string[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw Error('本機刊登草稿格式不正確');};
const uuid=(value:unknown)=>isUuid(value)&&value===value.toLowerCase();
function draft(value:unknown):SellerDraft {
  exact(value,['clientListingId','form','touched']);const result=parseSellerDraft(value);if(!result||!uuid(result.clientListingId))throw Error('本機刊登草稿不正確');
  exact(result.form,['title','description','brand','price','category','condition']);
  if(result.form.title.length>100||result.form.description.length>3000||result.form.brand.length>60||result.form.price.length>128)throw Error('本機刊登草稿太長');
  return structuredClone(result);
}
export function parseComposerDraft(raw:string,mediaId:string):ComposerDraft {
  const row=JSON.parse(raw);exact(row,['version','revision','mediaId','baseVersion','baseDraft','draft']);
  if(row.version!==1||!uuid(row.revision)||!uuid(row.mediaId)||row.mediaId!==mediaId||!Number.isSafeInteger(row.baseVersion)||row.baseVersion<0||row.baseVersion>1000001)throw Error('本機刊登草稿識別或版本不正確');
  return {...row,baseDraft:row.baseDraft===null?null:draft(row.baseDraft),draft:draft(row.draft)};
}
const same=(a:SellerDraft|null,b:SellerDraft|null)=>a===null||b===null?a===b:a.clientListingId===b.clientListingId&&sameSellerContent(a,b);
export function composerDetails(value:PublishDetails):PublishDetails {
  exact(value,['county','district','latitude','longitude','meetup','shipping','negotiable','expiryDate','consent']);
  for(const key of ['county','district','latitude','longitude','expiryDate'] as const)if(typeof value[key]!=='string'||value[key].length>(key==='county'||key==='district'?30:key==='expiryDate'?10:128))throw Error('本機共同設定不正確');
  for(const key of ['meetup','shipping','negotiable','consent'] as const)if(typeof value[key]!=='boolean')throw Error('本機共同設定不正確');
  const grid=(raw:string,min:number,max:number)=>/^\d+(?:\.\d+)?$/.test(raw)&&Number(raw)>=min&&Number(raw)<=max?Math.min(max-0.01,Math.floor(Number(raw)/0.02)*0.02+0.01).toFixed(2):raw;
  return {...value,latitude:grid(value.latitude,20,26.6),longitude:grid(value.longitude,117,123.8),consent:false};
}
export function parseComposerDetails(raw:string):PublishDetails {
  const row=JSON.parse(raw);exact(row,['version','revision','details']);if(row.version!==1||!uuid(row.revision)||row.details?.consent!==false)throw Error('本機共同設定不正確');
  const normalized=composerDetails(row.details);if(JSON.stringify(normalized)!==JSON.stringify(row.details))throw Error('本機地點未使用約略位置');return normalized;
}

/** One instance per signed-in page. Each mutable draft has a serialized CAS
 * queue. Immutable server-operation journals are never replaced here. */
export class ListingComposerDrafts {
  readonly entries=new Map<string,Entry>();
  detailsRaw:string|null=null;detailsValue:PublishDetails|null=null;detailsFailed=false;detailsPending=0;
  private detailsKey='';private detailsQueue=Promise.resolve();
  private apiUrl:string;private userId:number;private store:Store;private notify:()=>void;
  constructor(apiUrl:string,userId:number,store:Store,notify:()=>void){this.apiUrl=apiUrl;this.userId=userId;this.store=store;this.notify=notify;}
  async loadDetails(){
    this.detailsKey=await pendingRequestKey(this.apiUrl,this.userId,'listing-compose-details');
    this.detailsRaw=await this.store.get(this.detailsKey);this.detailsValue=this.detailsRaw?parseComposerDetails(this.detailsRaw):null;return this.detailsValue;
  }
  async restore(sources:ComposerSource[]) {
    const keys=await this.store.composerDraftKeys(await pendingScope(this.apiUrl,this.userId));
    for(const key of keys){const id=key.slice(key.lastIndexOf('.')+1);if(this.entries.has(id))continue;const raw=await this.store.get(key);if(!raw)continue;
      const value=parseComposerDraft(raw,id);this.entries.set(id,{key,raw,value,latest:null,conflict:true,failed:false,pending:0,queue:Promise.resolve()});}
    for(const source of sources){let entry=this.entries.get(source.id);
      if(!entry){const key=await pendingRequestKey(this.apiUrl,this.userId,'listing-compose.'+source.id);entry={key,raw:null,value:{version:1,revision:crypto.randomUUID(),mediaId:source.id,baseVersion:source.version,baseDraft:source.serverDraft,draft:source.draft},latest:source,conflict:false,failed:false,pending:0,queue:Promise.resolve()};this.entries.set(source.id,entry);}
      if(entry.raw===null&&!entry.pending&&!entry.failed)entry.value={...entry.value,baseVersion:source.version,baseDraft:source.serverDraft,draft:source.draft};
      entry.latest=source;entry.conflict=entry.value.baseVersion!==source.version||!same(entry.value.baseDraft,source.serverDraft);
    }
    const ids=new Set(sources.map(source=>source.id));for(const [id,entry] of this.entries)if(!ids.has(id)&&entry.raw){entry.latest=null;entry.conflict=true;}
  }
  get(id:string){return this.entries.get(id);}
  get failed(){return this.detailsFailed||[...this.entries.values()].some(entry=>entry.failed);}
  get writing(){return this.detailsPending>0||[...this.entries.values()].some(entry=>entry.pending>0);}
  stage(id:string,value:SellerDraft) {
    const entry=this.entries.get(id);if(!entry||entry.failed||same(entry.value.draft,value))return;
    entry.value={...entry.value,revision:crypto.randomUUID(),draft:draft(value)};
    this.write(entry,JSON.stringify(entry.value));
  }
  private write(entry:Entry,body:string) {
    entry.pending++;this.notify();
    entry.queue=entry.queue.then(async()=>{if(entry.failed)return;await this.store.replaceDraft(entry.key,entry.raw,body);entry.raw=body;})
      .catch(()=>{entry.failed=true;}).finally(()=>{entry.pending--;this.notify();});
  }
  stageDetails(value:PublishDetails) {
    if(!this.detailsKey)return;
    const normalized=composerDetails(value);if(this.detailsFailed||JSON.stringify(normalized)===JSON.stringify(this.detailsValue))return;
    this.detailsValue=normalized;const body=JSON.stringify({version:1,revision:crypto.randomUUID(),details:normalized});this.detailsPending++;this.notify();
    this.detailsQueue=this.detailsQueue.then(async()=>{if(this.detailsFailed)return;await this.store.replaceDraft(this.detailsKey,this.detailsRaw,body);this.detailsRaw=body;})
      .catch(()=>{this.detailsFailed=true;}).finally(()=>{this.detailsPending--;this.notify();});
  }
  async flush(id?:string) {
    const entries=id?[this.entries.get(id)].filter((entry):entry is Entry=>!!entry):[...this.entries.values()];
    await Promise.all([this.detailsQueue,...entries.map(entry=>entry.queue)]);
    if(this.detailsFailed||entries.some(entry=>entry.failed))return false;
    try{if(await this.store.get(this.detailsKey)!==this.detailsRaw){this.detailsFailed=true;this.notify();return false;}
      for(const entry of entries)if(await this.store.get(entry.key)!==entry.raw){entry.failed=true;this.notify();return false;}
    }catch{for(const entry of entries)entry.failed=true;this.detailsFailed=true;this.notify();return false;}
    return !entries.some(entry=>entry.conflict);
  }
  async acknowledge(id:string,version:number,serverDraft:SellerDraft|null,choice:'keep'|'server'='keep') {
    const entry=this.entries.get(id);if(!entry)return;
    await entry.queue;if(entry.failed)throw Error('本機草稿尚未安全保存');
    // CAS still detects another tab even when the server operation is proven.
    entry.value={...entry.value,revision:crypto.randomUUID(),baseVersion:version,baseDraft:serverDraft,draft:choice==='server'?(serverDraft??entry.latest!.draft):entry.value.draft};
    entry.conflict=false;entry.latest={id,version,serverDraft,draft:entry.value.draft};this.write(entry,JSON.stringify(entry.value));await entry.queue;
    if(entry.failed)throw Error('本機草稿已由另一分頁更新或未能保存');
  }
  async remove(id:string){const entry=this.entries.get(id);if(!entry)return;await entry.queue;
    if(entry.failed)throw Error('本機草稿尚未安全清理');if(entry.raw&&!await this.store.clearComposerDraft(entry.key,entry.raw))throw Error('本機草稿已由另一分頁更新');
    this.entries.delete(id);this.notify();
  }
}
