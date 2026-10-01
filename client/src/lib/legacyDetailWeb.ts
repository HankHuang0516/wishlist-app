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
export type DetailOperation={version:1;id:number;kind:'EDIT'|'PURCHASE'|'HIDE';itemId?:number;wanted?:boolean;localOperationId:string};
export function detailOperation(raw:string):DetailOperation {
  if(raw.length>512)throw new Error('Invalid operation');
  const row=object(JSON.parse(raw));
  if(row.version!==1 || !validWishId(row.id) || !isUuid(row.localOperationId) || !['EDIT','PURCHASE','HIDE'].includes(String(row.kind)) || Object.keys(row).some(key=>!['version','id','kind','itemId','wanted','localOperationId'].includes(key)) ||
    (row.kind==='EDIT' ? row.itemId!==undefined || row.wanted!==undefined : !validWishId(row.itemId) || typeof row.wanted!=='boolean')) throw new Error('Invalid operation');
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
const copy={zh:{readError:'尚未確認目前清單；請重試讀取。',denied:'請登入並核對清單權限。',missing:'目前找不到此清單。',retry:'重新讀取清單',invalid:'無效的清單編號。',edit:'編輯清單',title:'清單名稱',description:'清單說明',public:'公開清單',info:'查看願望',hide:'隱藏願望',show:'顯示願望',remove:'刪除願望',removeList:'刪除清單',purchase:'標記已送禮',purchased:'已確認送禮標記。',unmarked:'已確認取消送禮標記。',available:'取消送禮標記',clone:'加入我的清單',budget:'最高預算',original:'開啟原操作清單',editInvalid:'名稱需1–200字，說明最多1000字。'},en:{readError:'The current list is unconfirmed. Retry the read.',denied:'Sign in and check list permissions.',missing:'The list is currently unavailable.',retry:'Read list again',invalid:'Invalid list ID.',edit:'Edit wishlist',title:'List title',description:'List description',public:'Public list',info:'View wish',hide:'Hide wish',show:'Show wish',remove:'Delete wish',removeList:'Delete wishlist',purchase:'Mark as purchased',purchased:'Purchase mark confirmed.',unmarked:'Purchase mark removed.',available:'Undo purchase mark',clone:'Add to my wishlist',budget:'Maximum budget',original:'Open the original operation list',editInvalid:'Use 1–200 characters for the title and up to 1000 for the description.'}};
export function detailText(key:keyof typeof copy.zh){let locale='en';try{locale=getUserLocale();}catch{/* locale storage is optional */}return copy[locale.startsWith('zh')?'zh':'en'][key];}
