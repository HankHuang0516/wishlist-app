import { detailItemBody,legacyDetail,type DetailItemDraft,type DetailOperation,type LegacyDetailItem } from './legacyDetailWeb';
import { validWishId } from './wishManagement';
import { isUuid } from './listingBatch';
import { sha256 } from './webPendingStore';
import { getUserLocale } from '../utils/localization';
export type LegacyCreateKind='LINK'|'PHOTO';
function object(raw:unknown):Record<string,unknown>{if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Invalid create response');return raw as Record<string,unknown>;}
export async function prepareLegacyCreate(kind:LegacyCreateKind,listId:number,draft:DetailItemDraft,input:string,mediaId:string|null) {
  if(!validWishId(listId))throw new Error(createText('invalid'));
  let url=input.trim(),link:string|null=null,name=kind==='PHOTO'?'Photo wish':'',aiStatus=kind==='PHOTO'?'PENDING':'SKIPPED',aiError:string|null=null;
  if(kind==='LINK') {
    if(!url || url.length>2000 || /[\u0000-\u001f\u007f]/.test(url))throw new Error(createText('invalid'));
    if(/^https?:\/\//i.test(url)) {
      let parsed:URL;try{parsed=new URL(url);}catch{throw new Error(createText('invalid'));}
      const host=parsed.hostname.toLowerCase();
      if(parsed.username || parsed.password || parsed.port || !host.includes('.') || /[^a-z0-9.-]/.test(host) || /^\d+(?:\.\d+){3}$/.test(host) || /\.(localhost|local|internal|test|invalid)$/.test(host))throw new Error(createText('invalid'));
      url=parsed.href;link=url;name='Processing Link...';if(parsed.protocol==='https:')aiStatus='PENDING';else aiError='HTTPS_REQUIRED';
    }else {if(url.length>200 || /^[a-z][a-z0-9+.-]*:/i.test(url))throw new Error(createText('invalid'));name=url;}
    if(mediaId!==null)throw new Error(createText('invalid'));
  }else if(!isUuid(mediaId))throw new Error(createText('photoUnknown'));
  const fields=detailItemBody({...draft,name:draft.name.trim()||name,link:link??''});
  const data={name:fields.name,notes:fields.notes,price:fields.price,currency:fields.currency,maxPrice:fields.maxPrice,priceCurrency:fields.maxPrice===null?null:fields.priceCurrency!,link,mediaId,proxy_end_user_id:null,aiStatus,aiError};
  const clientRequestId=crypto.randomUUID(),requestHash=await sha256(JSON.stringify(['legacy-create-v1',kind,listId,data]));
  const body={...(kind==='LINK'?{url}:{mediaId}),...fields,clientRequestId,requestHash};
  // LINK's source establishes link; the legacy parser accepts no separate link field.
  const {link:_link,...payload}=body;
  return {payload,data,clientRequestId,requestHash};
}
export function legacyCreateAck(value:unknown,operation:Omit<DetailOperation,'version'|'localOperationId'>,data:Awaited<ReturnType<typeof prepareLegacyCreate>>['data']):LegacyDetailItem {
  const row=object(value),kind=operation.kind==='LINK_CREATE'?'LINK':'PHOTO';
  if(row.clientRequestId!==operation.clientRequestId || row.requestHash!==operation.requestHash || row.createKind!==kind || !validWishId(row.id) || row.wishlistId!==operation.id || typeof row.replayed!=='boolean' || row.isPurchased!==false || row.isHidden!==false || row.uploadStatus!=='COMPLETED' || Object.entries(data).filter(([key])=>key!=='mediaId').some(([key,value])=>row[key]!==value))throw new Error('Create ACK mismatch');
  return legacyDetail({id:operation.id,userId:1,title:'confirmed',isPublic:false,items:[row]},operation.id).items[0];
}
export function legacyCreateReceipt(value:unknown,operation:DetailOperation) {
  const row=object(value),kind=operation.kind==='LINK_CREATE'?'LINK':'PHOTO';
  if(!['LINK_CREATE','PHOTO_CREATE'].includes(operation.kind) || row.kind!==kind || row.clientRequestId!==operation.clientRequestId || row.requestHash!==operation.requestHash || row.wishlistId!==operation.id || !['CREATED','ABANDONED'].includes(String(row.state)) || typeof row.deleted!=='boolean')throw new Error('Create receipt mismatch');
  if(row.state==='ABANDONED'){if(row.resourceId!==null || row.resource!==null || row.deleted)throw new Error('Invalid create stop');}
  else {if(!validWishId(row.resourceId) || (row.deleted?row.resource!==null:object(row.resource).id!==row.resourceId || object(row.resource).wishlistId!==operation.id))throw new Error('Invalid created resource');}
  return {state:row.state as 'CREATED'|'ABANDONED',deleted:row.deleted,resourceId:row.resourceId as number|null};
}
const copy={zh:{title:'新增願望 · 網址或文字',photoTitle:'新增願望 · 照片辨識',input:'商品網址或願望文字',tip:'HTTPS 商品網址交給 AI 排隊；文字直接保存為手動願望。HTTP 網址保留參考連結，請使用 HTTPS 或上傳截圖做辨識。',invalid:'請輸入無帳密的公開 http(s) 網址，或200字內的願望文字。',name:'願望名稱（選填，照片可由 AI 更新）',submit:'保存並新增願望',created:'願望建立已確認；辨識以後台狀態為準。',pending:'原願望建立待查核；重新開啟不會重送。',unknown:'尚未確認原願望建立；識別碼與內容雜湊保留，不會另建。',read:'查核原願望建立',stop:'安全停止原願望建立',found:'原願望已建立；請重新讀取清單查看目前內容。',deleted:'原願望曾建立，但後來已刪除；不會重建。',stopped:'原願望建立已安全停止；晚到請求不會新增。',notFound:'尚未取得原建立回執，不能推定未建立；可再查核或安全停止。',photoRead:'查核原照片上傳',photoStop:'安全停止原照片上傳',photoUnknown:'原照片尚未確認；不會用新識別碼重傳。',photoReady:'原照片已上傳；保存願望後才排入辨識。',photoAttached:'照片已附加到願望，不能再次使用。',photoStopped:'原照片上傳已停止或照片已移除，不會重新上傳。',photoClean:'清理已確認照片的本機標記',photoCleanup:'照片狀態已確認，但本機標記尚未清理；可再查核並清理。',photoRetry:'選回同一照片，明確重試原上傳',photoNew:'選擇願望照片',photoCamera:'拍攝願望照片',photoRemove:'移除未使用照片',photoRemovalRead:'查核原照片移除',photoRemovalTitle:'確認移除未使用照片',photoRemovalHelp:'只移除此張未附加照片。願望已使用的照片不能由此移除。',photoRemoved:'已確認原照片移除；實體檔案依後台清理。',photoRemovalUnknown:'原照片移除待查核；重新開啟不會重送。',source:'開啟原照片清單',photoHelp:'照片會去除位置資訊並縮小；知道圖片網址的人仍可能查看。請勿上傳個資。'},en:{title:'Add wish · Link or text',photoTitle:'Add wish · Photo recognition',input:'Product URL or wish text',tip:'HTTPS product links enter the AI queue. Text saves as a manual wish. HTTP links remain references; use HTTPS or upload a screenshot for recognition.',invalid:'Use a public http(s) URL without credentials, or wish text up to 200 characters.',name:'Wish name · optional, AI may update it for photos',submit:'Save and add wish',created:'Wish creation confirmed; recognition follows backend state.',pending:'The original wish needs a check; reopening will not resend it.',unknown:'Original wish creation is unconfirmed. Its identity and content hash are retained; no replacement is created.',read:'Check original wish creation',stop:'Safely stop original wish creation',found:'The original wish was created. Read the list again for its current content.',deleted:'The original wish was created, then deleted; it will not be recreated.',stopped:'Original wish creation was safely stopped; delayed requests cannot add it.',notFound:'The original receipt is unavailable; this does not prove nothing was created. Check again or safely stop.',photoRead:'Check original photo upload',photoStop:'Safely stop original photo upload',photoUnknown:'The original photo is unconfirmed; no new upload identity will be used.',photoReady:'The original photo was uploaded; save the wish to queue recognition.',photoAttached:'This photo is attached to a wish and cannot be reused.',photoStopped:'The original upload was stopped or its photo removed; it will not be uploaded again.',photoClean:'Clean confirmed local photo marker',photoCleanup:'Photo status is confirmed, but its local marker remains. Check and clean it again.',photoRetry:'Select the same photo and explicitly retry its upload',photoNew:'Select wish photo',photoCamera:'Take wish photo',photoRemove:'Remove unused photo',photoRemovalRead:'Check original photo removal',photoRemovalTitle:'Confirm unused photo removal',photoRemovalHelp:'Only this unattached photo is removed. A photo already used by a wish cannot be removed here.',photoRemoved:'Original photo removal confirmed; backend cleanup handles the physical file.',photoRemovalUnknown:'Original photo removal needs a check; reopening will not resend it.',source:'Open original photo list',photoHelp:'Photos are resized and location metadata removed. Anyone with the image URL may still view it. Do not upload personal data.'}};
export function createText(key:keyof typeof copy.zh){let locale='en';try{locale=getUserLocale();}catch{/* optional locale */}return copy[locale.startsWith('zh')?'zh':'en'][key];}
