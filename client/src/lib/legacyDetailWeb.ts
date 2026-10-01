import { validWishId } from './wishManagement';
import { isUuid } from './listingBatch';
import { getUserLocale } from '../utils/localization';

export interface LegacyDetailItem {
  id:number; name:string; price?:string; currency?:string; maxPrice?:number; priceCurrency?:string;
  link?:string; aiLink?:string; imageUrl?:string; notes?:string; tags?:string[];
  uploadStatus:string; aiStatus:string; aiError?:string; isHidden:boolean; isPurchased:boolean;
  originalUser?:{id:number;name:string;nicknames:string|null};
}
export interface LegacyDetailList {
  id:number; title:string; description:string; isPublic:boolean; userId:number; items:LegacyDetailItem[];
  user?:{id:number;name:string;nicknames?:string}; maxItems?:number;
}
function object(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid detail response');
  return value as Record<string,unknown>;
}
const text=(value:unknown)=>typeof value==='string'?value:undefined;
/** Owner and public DTOs differ. Never infer gift completion from AI fields. */
export function legacyDetail(value:unknown,id:number):LegacyDetailList {
  const row=object(value),owner=row.user?object(row.user):undefined,ownerId=row.userId??owner?.id;
  if(row.id!==id || !validWishId(ownerId) || typeof row.title!=='string' || typeof row.isPublic!=='boolean' || !Array.isArray(row.items) || row.items.length>10000 || owner && owner.id!==ownerId) throw new Error('Invalid list identity');
  const seen=new Set<number>();
  const items=row.items.map(value=>{
    const item=object(value);
    if(!validWishId(item.id) || seen.has(item.id) || typeof item.name!=='string' || typeof item.isPurchased!=='boolean' || item.wishlistId!==undefined && item.wishlistId!==id) throw new Error('Invalid item identity');
    seen.add(item.id);
    const original=item.originalUser?object(item.originalUser):undefined;
    return {
      id:item.id,name:item.name,price:text(item.price),currency:text(item.currency),
      maxPrice:typeof item.maxPrice==='number' && Number.isFinite(item.maxPrice) && item.maxPrice>=0?item.maxPrice:undefined,priceCurrency:text(item.priceCurrency),
      link:text(item.link),aiLink:text(item.aiLink),imageUrl:text(item.imageUrl),notes:text(item.notes),
      tags:Array.isArray(item.tags) && item.tags.every(x=>typeof x==='string')?item.tags:undefined,
      // Public SELECT intentionally omits private processing/hidden fields.
      uploadStatus:text(item.uploadStatus)??'COMPLETED',aiStatus:text(item.aiStatus)??'UNAVAILABLE',
      // Keep the existing blocked-source help without retaining provider diagnostics.
      aiError:typeof item.aiError==='string' && item.aiError.includes('403')?'403':undefined,
      isHidden:item.isHidden===true,isPurchased:item.isPurchased,
      originalUser:original && validWishId(original.id) && typeof original.name==='string'?{id:original.id,name:original.name,nicknames:text(original.nicknames)??null}:undefined,
    };
  });
  return {id,title:row.title,description:text(row.description)??'',isPublic:row.isPublic,userId:ownerId,items,
    user:owner && typeof owner.name==='string'?{id:ownerId,name:owner.name,nicknames:text(owner.nicknames)}:undefined,
    maxItems:Number.isSafeInteger(row.maxItems) && Number(row.maxItems)>0 && Number(row.maxItems)<=10000?Number(row.maxItems):undefined};
}
export type DetailOperation={version:1;id:number;kind:'EDIT'|'PURCHASE'|'HIDE'|'ITEM_EDIT'|'DELETE_ITEM'|'DELETE_LIST'|'CLONE'|'LINK_CREATE'|'PHOTO_CREATE';requestHash?:string;mediaId?:string;itemId?:number;wanted?:boolean;targetWishlistId?:number;clientRequestId?:string;localOperationId:string};
export function detailOperation(raw:string):DetailOperation {
  if(raw.length>768)throw new Error('Invalid operation');
  const row=object(JSON.parse(raw));
  if(row.version!==1 || !validWishId(row.id) || !isUuid(row.localOperationId) || !['EDIT','PURCHASE','HIDE','ITEM_EDIT','DELETE_ITEM','DELETE_LIST','CLONE','LINK_CREATE','PHOTO_CREATE'].includes(String(row.kind)) || Object.keys(row).some(key=>!['version','id','kind','itemId','wanted','targetWishlistId','clientRequestId','requestHash','mediaId','localOperationId'].includes(key)))throw new Error('Invalid operation');
  if(['EDIT','DELETE_LIST','LINK_CREATE','PHOTO_CREATE'].includes(String(row.kind))?row.itemId!==undefined:!validWishId(row.itemId))throw new Error('Invalid item operation');
  if(['PURCHASE','HIDE'].includes(String(row.kind))?typeof row.wanted!=='boolean':row.wanted!==undefined)throw new Error('Invalid operation value');
  if(row.kind==='CLONE'){if(!validWishId(row.targetWishlistId) || !isUuid(row.clientRequestId) || row.requestHash!==undefined || row.mediaId!==undefined)throw new Error('Invalid clone operation');}
  else if(['LINK_CREATE','PHOTO_CREATE'].includes(String(row.kind))){if(row.targetWishlistId!==undefined || !isUuid(row.clientRequestId) || typeof row.requestHash!=='string' || !/^[a-f0-9]{64}$/.test(row.requestHash) || (row.kind==='PHOTO_CREATE'?!isUuid(row.mediaId):row.mediaId!==undefined))throw new Error('Invalid create operation');}
  else if(row.targetWishlistId!==undefined || row.clientRequestId!==undefined || row.requestHash!==undefined || row.mediaId!==undefined)throw new Error('Invalid operation metadata');
  return row as DetailOperation;
}
export function detailEditAck(value:unknown,list:LegacyDetailList,userId:number,body:{title:string;description:string;isPublic:boolean}):LegacyDetailList {
  const row=object(value);
  if(row.id!==list.id || row.userId!==userId || row.title!==body.title || row.description!==body.description || row.isPublic!==body.isPublic) throw new Error('Edit response mismatch');
  // The legacy edit ACK does not contain children; retain confirmed children.
  return {...list,...body};
}
export function detailItemAck(value:unknown,itemId:number,field:'isPurchased'|'isHidden',wanted:boolean) {
  const row=object(value);if(row.id!==itemId || row[field]!==wanted)throw new Error('Item response mismatch');
}
export type DetailItemDraft={name:string;notes:string;link:string;price:string;currency:string;budget:string;budgetCurrency:string};
export function detailItemBody(draft:DetailItemDraft) {
  const name=draft.name.trim(),currency=draft.currency.trim().toUpperCase(),budgetCurrency=draft.budgetCurrency.trim().toUpperCase();
  if(!name || name.length>200 || /[\u0000-\u001f\u007f]/.test(name) || draft.notes.length>1000 || draft.notes.includes('\u0000'))throw new Error(detailItemText('invalid'));
  function amount(raw:string) {const value=raw.trim();if(!value)return null;if(!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value)>1e12)throw new Error(detailItemText('invalidPrice'));return Number(value);}
  const price=amount(draft.price),maxPrice=amount(draft.budget),currencies=['TWD','USD','JPY','EUR','GBP','CNY','HKD','KRW','SGD','AUD','CAD'];
  if(!currencies.includes(currency) || maxPrice!==null && !currencies.includes(budgetCurrency))throw new Error(detailItemText('invalidCurrency'));
  let link:string|null=null;if(draft.link.trim()){link=safeDetailLink(draft.link.trim());if(!link || link.length>2048)throw new Error(detailItemText('invalidLink'));}
  return {name,notes:draft.notes,link,price:price===null?null:String(price),currency,maxPrice,...(maxPrice===null?{}:{priceCurrency:budgetCurrency})};
}
export function detailItemEditAck(value:unknown,item:LegacyDetailItem,listId:number,body:ReturnType<typeof detailItemBody>):LegacyDetailItem {
  const row=object(value);
  if(row.id!==item.id || row.wishlistId!==listId || Object.entries(body).some(([key,value])=>row[key]!==value) || body.maxPrice===null && row.priceCurrency!==null)throw new Error('Item edit mismatch');
  return {...item,name:body.name,notes:body.notes,link:body.link??undefined,price:body.price??undefined,currency:body.currency,maxPrice:body.maxPrice??undefined,priceCurrency:body.maxPrice===null?undefined:body.priceCurrency};
}
export function detailDeletedAck(value:unknown,id:number){const row=object(value);if(row.id!==id || row.deleted!==true)throw new Error('Deletion mismatch');}
export function safeDetailLink(value:string|undefined):string|null {if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password?url.href:null;}catch{return null;}}
export function detailCloneAck(value:unknown,operation:Pick<DetailOperation,'kind'|'itemId'|'targetWishlistId'|'clientRequestId'>) {
  const row=object(value);
  if(operation.kind!=='CLONE' || row.clientRequestId!==operation.clientRequestId || row.clonedFromItemId!==operation.itemId || row.wishlistId!==operation.targetWishlistId || !validWishId(row.id) || row.id===operation.itemId || typeof row.name!=='string' || typeof row.isPurchased!=='boolean' || typeof row.isHidden!=='boolean' || !['COMPLETED','SKIPPED','FAILED'].includes(String(row.aiStatus)))throw new Error('Clone ACK mismatch');
  return row;
}
export function detailCloneTargets(value:unknown,userId:number) {
  if(!Array.isArray(value) || value.length>10000)throw new Error('Invalid clone targets');const seen=new Set<number>();
  return value.map(value=>{const row=object(value);if(!validWishId(row.id) || row.userId!==userId || seen.has(row.id) || typeof row.title!=='string' || !row.title.trim() || row.title.length>200 || !Number.isInteger(row.maxItems) || Number(row.maxItems)<1 || Number(row.maxItems)>10000 || !Array.isArray(row.items) || row.items.length>10000)throw new Error('Invalid own list');seen.add(row.id);return {id:row.id,title:row.title,maxItems:Number(row.maxItems),count:row.items.length};});
}
export function detailCloneReceipt(value:unknown,operation:DetailOperation) {
  const row=object(value);
  if(operation.kind!=='CLONE' || row.kind!=='CLONE' || row.clientRequestId!==operation.clientRequestId || row.sourceItemId!==operation.itemId || row.targetWishlistId!==operation.targetWishlistId || !['CREATED','ABANDONED'].includes(String(row.state)) || typeof row.deleted!=='boolean')throw new Error('Clone receipt mismatch');
  if(row.state==='ABANDONED'){if(row.resourceId!==null || row.resource!==null || row.deleted)throw new Error('Invalid stop receipt');}
  else {if(!validWishId(row.resourceId) || row.resourceId===operation.itemId)throw new Error('Invalid clone identity');if(row.deleted?row.resource!==null:object(row.resource).id!==row.resourceId || object(row.resource).wishlistId!==operation.targetWishlistId)throw new Error('Invalid clone resource');}
  return {state:row.state as 'CREATED'|'ABANDONED',deleted:row.deleted,resourceId:row.resourceId as number|null};
}
const itemCopy={zh:{createList:'建立我的清單',dashboard:'返回我的清單',aiSkipped:'傳統模式',blocked:'AI 無法存取此網頁 (反爬蟲阻擋)',blockedHelp:'建議您截圖商品圖片，並使用「上傳圖片」功能新增物品。',edit:'編輯願望',name:'願望名稱',price:'原網站參考價格',currency:'參考價格幣別',budget:'最高預算',budgetCurrency:'預算幣別',notes:'備註',link:'參考商品連結',aiLink:'AI 參考商品',search:'搜尋商品',saved:'願望保存已確認。',missing:'未設定',noNotes:'無備註',wisher:'最初許願者',profile:'查看許願者個人頁',zoom:'放大願望圖片',invalid:'名稱需1–200字，備註最多1000字。',invalidPrice:'價格與預算須為非負金額，最多兩位小數。',invalidCurrency:'請使用支援的幣別，例如 TWD、USD、JPY。',invalidLink:'連結須為無帳密的 http(s) 網址。',created:'願望複製已確認。',pending:'原願望複製待查核；重新開啟不會重送。請讀取原回執或安全停止原複製。',unknown:'尚未確認原複製結果；識別碼保留，不會自動另建。',read:'查核原願望複製',stop:'安全停止原複製',stopped:'原複製已安全停止；晚到請求不會建立願望。',found:'原複製已建立；目前願望可到目標清單查看。',deleted:'原複製曾建立，但願望後來已刪除；不會重新建立。',notFound:'尚未取得原複製回執，不能推定未建立；可再查核或安全停止。',target:'複製到清單',readTargets:'重新讀取我的清單',targetsUnknown:'尚未確認我的清單；請重試讀取。',emptyTargets:'尚無可用的本人清單。',confirmClone:'確認加入清單',deleteConfirm:'此操作無法復原，請核對願望／清單名稱。',listDeleted:'已確認刪除清單。'},en:{createList:'Create my wishlist',dashboard:'Back to my lists',aiSkipped:'Manual mode',blocked:'AI could not access the source page.',blockedHelp:'Capture the product image and add it using the image upload entry.',edit:'Edit wish',name:'Wish name',price:'Legacy reference price',currency:'Reference price currency',budget:'Maximum budget',budgetCurrency:'Budget currency',notes:'Notes',link:'Reference product link',aiLink:'AI reference product',search:'Search for product',saved:'Wish save confirmed.',missing:'Not set',noNotes:'No notes',wisher:'Original wisher',profile:'View wisher profile',zoom:'Enlarge wish image',invalid:'Use 1–200 characters for the name and up to 1000 for notes.',invalidPrice:'Use non-negative amounts with at most two decimal places.',invalidCurrency:'Use a supported currency, such as TWD, USD or JPY.',invalidLink:'Use an http(s) URL without credentials.',created:'Wish clone confirmed.',pending:'The original clone needs a check and will not be resent on reopen. Read its receipt or safely stop it.',unknown:'The original clone is unconfirmed. Its identity is retained; no replacement will be created automatically.',read:'Check original wish clone',stop:'Safely stop original clone',stopped:'The original clone was safely stopped; delayed requests cannot create it.',found:'The original clone was created. View its current wish in the target list.',deleted:'The original clone was created, then its wish was deleted. It will not be recreated.',notFound:'The original clone receipt is unavailable; this does not prove no wish was created. Check again or safely stop.',target:'Copy to wishlist',readTargets:'Read my lists again',targetsUnknown:'Your lists are unconfirmed. Retry the read.',emptyTargets:'No own list is currently available.',confirmClone:'Confirm copy to list',deleteConfirm:'This cannot be undone. Check the wish or list name.',listDeleted:'List deletion confirmed.'}};
export function detailItemText(key:keyof typeof itemCopy.zh){let locale='en';try{locale=getUserLocale();}catch{/* locale storage optional */}return itemCopy[locale.startsWith('zh')?'zh':'en'][key];}
const copy={zh:{readError:'尚未確認目前清單；請重試讀取。',denied:'請登入並核對清單權限。',missing:'目前找不到此清單。',retry:'重新讀取清單',invalid:'無效的清單編號。',edit:'編輯清單',title:'清單名稱',description:'清單說明',public:'公開清單',info:'查看願望',hide:'隱藏願望',show:'顯示願望',remove:'刪除願望',removeList:'刪除清單',purchase:'標記已送禮',purchased:'已確認送禮標記。',unmarked:'已確認取消送禮標記。',available:'取消送禮標記',clone:'加入我的清單',budget:'最高預算',original:'開啟原操作清單',editInvalid:'名稱需1–200字，說明最多1000字。'},en:{readError:'The current list is unconfirmed. Retry the read.',denied:'Sign in and check list permissions.',missing:'The list is currently unavailable.',retry:'Read list again',invalid:'Invalid list ID.',edit:'Edit wishlist',title:'List title',description:'List description',public:'Public list',info:'View wish',hide:'Hide wish',show:'Show wish',remove:'Delete wish',removeList:'Delete wishlist',purchase:'Mark as purchased',purchased:'Purchase mark confirmed.',unmarked:'Purchase mark removed.',available:'Undo purchase mark',clone:'Add to my wishlist',budget:'Maximum budget',original:'Open the original operation list',editInvalid:'Use 1–200 characters for the title and up to 1000 for the description.'}};
export function detailText(key:keyof typeof copy.zh){let locale='en';try{locale=getUserLocale();}catch{/* locale storage is optional */}return copy[locale.startsWith('zh')?'zh':'en'][key];}
