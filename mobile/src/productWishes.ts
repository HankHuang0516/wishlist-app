import {ApiError} from './api';
import {uuid} from './listingForm';
export type WishProduct={kind:'listing'|'source'|'external';id:string;title:string};
export type ProductWishPending={action:'ADD'|'REMOVE';kind:WishProduct['kind'];productId:string;wishlistId:number;clientRequestId:string;expectedItemId?:number};
export type ProductWishList={id:number;title:string;isPublic:boolean;remaining:number};
export type SavedProductWish={productKey:string;itemId:number;wishlistId:number};
type State={lists:ProductWishList[];saved:SavedProductWish[];ready:boolean;busy:boolean;pending:ProductWishPending|null;issue:string;notice:string;retryAt:number};
type Read=(path:string,options?:{method?:string;body?:string})=>Promise<unknown>;
type Journal={get:()=>Promise<string|null>;save:(raw:string)=>Promise<void>;clear:(raw:string)=>Promise<unknown>};
const integer=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>0&&Number(n)<=2147483647;
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid wish data');return v as Record<string,unknown>;};
export function parseProductWishState(value:unknown){
 const v=object(value);if(!Array.isArray(v.lists)||!Array.isArray(v.saved)||v.lists.length>5000||v.saved.length>500000)throw Error('Invalid wishlist state');
 const lists=v.lists.map(value=>{const l=object(value);if(!integer(l.id)||typeof l.title!=='string'||l.title.length>1000||typeof l.isPublic!=='boolean'||!Number.isSafeInteger(l.remaining)||Number(l.remaining)<0)throw Error('Invalid wishlist');return l as ProductWishList;});
 if(new Set(lists.map(l=>l.id)).size!==lists.length)throw Error('Duplicate wishlist');
 const saved=v.saved.map(value=>{const s=object(value),[kind,id]=String(s.productKey).split(':');if(!['listing','source','external'].includes(kind)||!uuid(id)||s.productKey!==kind+':'+id||!integer(s.itemId)||!integer(s.wishlistId)||!lists.some(l=>l.id===s.wishlistId))throw Error('Invalid saved wish');return s as SavedProductWish;});
 if(new Set(saved.map(s=>s.productKey)).size!==saved.length)throw Error('Duplicate saved wish');
 return {lists,saved};
}
export function parseProductWishPending(value:unknown):ProductWishPending{
 const v=object(typeof value==='string'?JSON.parse(value):value),keys=v.action==='REMOVE'?'action,clientRequestId,expectedItemId,kind,productId,wishlistId':'action,clientRequestId,kind,productId,wishlistId';
 if(Object.keys(v).sort().join(',')!==keys||!['ADD','REMOVE'].includes(String(v.action))||!['listing','source','external'].includes(String(v.kind))||!uuid(v.productId)||!uuid(v.clientRequestId)||!integer(v.wishlistId)||v.action==='REMOVE'&&!integer(v.expectedItemId))throw Error('Invalid pending product wish');
 return v as ProductWishPending;
}
export function parseProductWishReceipt(value:unknown,operation:ProductWishPending){
 const r=object(value);
 if(r.clientRequestId!==operation.clientRequestId||r.productKey!==operation.kind+':'+operation.productId||r.wishlistId!==operation.wishlistId||(r.action??'ADD')!==operation.action||typeof r.deleted!=='boolean'||(r.deleted?r.itemId!==null:!integer(r.itemId)))throw Error('Product wish receipt mismatch');
 return r;
}

/** One controller per API/owner session. Only explicit submit/retry sends POST.
 * A durable journal precedes every send, and unknown results retain that UUID. */
export class ProductWishController{
 private state:State={lists:[],saved:[],ready:false,busy:false,pending:null,issue:'',notice:'',retryAt:0};
 private listeners=new Set<()=>void>();private alive=true;private lock=false;private raw:string|null=null;private epoch=0;
 constructor(private read:Read,private journal:Journal,private newId:()=>string){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(patch:Partial<State>){if(!this.alive)return;this.state={...this.state,...patch};this.listeners.forEach(l=>l());}
 destroy(){this.alive=false;this.epoch++;this.lock=false;this.listeners.clear();}
 private current(epoch:number){return this.alive&&this.epoch===epoch;}
 private mark(raw:string|null){this.raw=raw;this.update({pending:raw?parseProductWishPending(raw):null});}
 private async load(epoch:number){const data=parseProductWishState(await this.read('/product-wishes'));if(this.current(epoch))this.update({...data,ready:true});}
 private async accept(value:unknown,operation:ProductWishPending,raw:string,epoch:number){
  const receipt=parseProductWishReceipt(value,operation);if(!this.current(epoch))return;
  await this.journal.clear(raw);if(!this.current(epoch))return;const left=await this.journal.get();if(!this.current(epoch))return;
  this.mark(left);this.update({ready:false,issue:left?'另一個願望操作尚待確認。':'',notice:operation.action==='REMOVE'?'已從願望清單移除。':receipt.deleted?'原願望後來已移除，不會重新建立。':'已加入願望清單，可到「願望」查看。'});
  await this.load(epoch);
 }
 async start(){
  if(this.lock)return;this.alive=true;const epoch=this.epoch;this.lock=true;this.update({busy:true,ready:false,issue:''});
  try{const raw=await this.journal.get();if(!this.current(epoch))return;this.mark(raw);let loaded=false;
   if(raw){const op=parseProductWishPending(raw);try{await this.accept(await this.read('/product-wishes/receipts/'+op.clientRequestId),op,raw,epoch);loaded=true;}catch{if(this.current(epoch))this.update({issue:'願望操作結果尚未確認，可查核或重試原操作。'});}}
   if(this.current(epoch)&&!loaded)await this.load(epoch);
  }catch{if(this.current(epoch))this.update({ready:false,issue:'願望清單或待確認資料無法讀取，請重新核對；尚未送出新操作。'});}
  finally{if(this.current(epoch)){this.lock=false;this.update({busy:false});}}
 }
 operation(product:WishProduct,wishlistId:number,remove?:SavedProductWish):ProductWishPending{
  if(remove&&(remove.productKey!==product.kind+':'+product.id||remove.wishlistId!==wishlistId))throw Error('Saved product wish changed');
  return parseProductWishPending({action:remove?'REMOVE':'ADD',kind:product.kind,productId:product.id,wishlistId,clientRequestId:this.newId(),...(remove?{expectedItemId:remove.itemId}:{})});
 }
 async submit(operation:ProductWishPending,retry=false){
  if(this.lock||!this.alive||!retry&&(!this.state.ready||this.raw))return;
  if(this.state.retryAt>Date.now()){this.update({issue:`請等候 ${Math.ceil((this.state.retryAt-Date.now())/1000)} 秒後再重試原操作。`});return;}
  const epoch=this.epoch;this.lock=true;this.update({busy:true,issue:'',notice:''});let sent=false;
  let raw='';
  try{
   raw=JSON.stringify(parseProductWishPending(operation));
   const old=await this.journal.get();if(!this.current(epoch))return;
   if(old&&old!==raw){this.mark(old);this.update({issue:'先前操作尚未確認，請先查核。'});return;}
   if(retry&&old!==raw)throw Error('Pending journal changed');
   await this.journal.save(raw);if(!this.current(epoch))return;this.mark(raw);sent=true;
   await this.accept(await this.read('/product-wishes',{method:'POST',body:raw}),operation,raw,epoch);
  }catch(error){
   if(!this.current(epoch))return;
   if(error instanceof ApiError&&error.status===429){const seconds=Number.isFinite(error.retryAfterSeconds)&&Number(error.retryAfterSeconds)>0?Math.min(Number(error.retryAfterSeconds),86400):60;this.update({retryAt:Date.now()+seconds*1000});}
   if(sent&&error instanceof ApiError&&[400,401,403,404,409].includes(error.status)){
    try{await this.journal.clear(raw);if(!this.current(epoch))return;const left=await this.journal.get();if(!this.current(epoch))return;this.mark(left);await this.load(epoch);if(this.current(epoch))this.update({issue:'商品或願望清單已變更，請重新核對。'});}catch{if(this.current(epoch))this.update({ready:false,issue:'操作未能核對，請重新讀取清單與待確認資料。'});}
   }else this.update({ready:sent?this.state.ready:false,issue:sent?(this.raw?'操作結果尚未確認，請查核或重試原操作；不會自動重送。':'願望清單暫時無法更新，請重新核對。'):'無法安全保存操作，尚未送出；請重新核對待確認資料。'});
  }finally{if(this.current(epoch)){this.lock=false;this.update({busy:false});}}
 }
 async check(){
  if(this.lock||!this.alive||!this.raw)return;const epoch=this.epoch;this.lock=true;this.update({busy:true,issue:''});const raw=this.raw;
  try{const op=parseProductWishPending(raw);await this.accept(await this.read('/product-wishes/receipts/'+op.clientRequestId),op,raw,epoch);}catch{if(this.current(epoch))this.update({issue:'操作結果仍未確認；可稍後查核，或明確重試原操作。'});}finally{if(this.current(epoch)){this.lock=false;this.update({busy:false});}}
 }
 retry(){return this.state.pending?this.submit(this.state.pending,true):Promise.resolve();}
}
