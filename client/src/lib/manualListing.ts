import { buildPublishedListing, isUuid, listingCategories, type ListingDraftForm, type PublishDetails } from './listingBatch';
export const emptyManualDetails=():PublishDetails=>({county:'',district:'',latitude:'',longitude:'',meetup:true,shipping:false,negotiable:false,expiryDate:'',consent:false});
/** The existing purpose-filtered unused-media DTO intentionally omits owner and purpose. */
export function manualPhotoIds(rows:unknown[],apiUrl:string){const base=apiUrl.replace(/\/api\/?$/,'');
  return rows.map(value=>{const row=value as Record<string,unknown>;
    if(!row||!isUuid(row.id)||row.imageUrl!==`${base}/api/listing-media/${row.id}/image`||row.thumbnailUrl!==`${base}/api/listing-media/${row.id}/thumbnail`
      ||![row.width,row.height].every(v=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<=1600)||typeof row.byteSize!=='number'||!Number.isSafeInteger(row.byteSize)||row.byteSize<1||row.byteSize>5*1024*1024
      ||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))throw Error('私人照片資料不正確');return row.id;});
}
/** Native save(false): only the name is required; supplied optional fields must still be valid. */
export function buildManualListing(id:string,form:ListingDraftForm,mediaIds:string[],details:PublishDetails,publish:boolean,now=new Date()) {
  if(!isUuid(id)||!form.title.trim()||form.title.trim().length>100)throw Error('請填寫 100 字內的商品名稱。');
  if(form.description.trim().length>3000||form.brand.trim().length>60)throw Error('商品說明最多 3000 字，品牌最多 60 字。');
  if(!listingCategories.some(([key])=>key===form.category)||!['USED','NEW'].includes(form.condition))throw Error('請選擇有效分類與新舊狀態。');
  if(form.price&&(!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price)||Number(form.price)>9_999_999_999.99))throw Error('請填寫有效售價；贈送請填 0，最多兩位小數。');
  if(mediaIds.length>8||mediaIds.some(value=>!isUuid(value))||new Set(mediaIds).size!==mediaIds.length)throw Error('每件商品最多 8 張不同的照片。');
  const hasLocation=[details.county,details.district,details.latitude,details.longitude].some(value=>!!value.trim());
  let location;
  if(hasLocation){const latitude=Number(details.latitude),longitude=Number(details.longitude);
    if([details.county,details.district,details.latitude,details.longitude].some(value=>!value.trim())||details.county.trim().length>30||details.district.trim().length>30||!Number.isFinite(latitude)||latitude<20||latitude>26.6||!Number.isFinite(longitude)||longitude<117||longitude>123.8)throw Error('填寫地點時，請完成台灣縣市、行政區與有效座標；也可全部留白儲存草稿。');
    location={county:details.county.trim(),district:details.district.trim(),latitude:Number(Math.min(26.59,Math.floor(latitude/.02)*.02+.01).toFixed(2)),longitude:Number(Math.min(123.79,Math.floor(longitude/.02)*.02+.01).toFixed(2))};}
  if(details.expiryDate){const end=new Date(details.expiryDate+'T23:59:59.999+08:00');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(details.expiryDate)||!Number.isFinite(end.getTime())||new Date(end.getTime()+8*60*60*1000).toISOString().slice(0,10)!==details.expiryDate||end<=now)throw Error('請選擇未來的失效日期。');}
  if(publish)return {...buildPublishedListing({clientListingId:id,form,touched:{}},mediaIds[0],details),mediaIds};
  return {clientListingId:id,title:form.title.trim(),...(form.description.trim()?{description:form.description.trim()}:{}),...(form.brand.trim()?{brand:form.brand.trim()}:{}),
    condition:form.condition,category:form.category,...(form.price?{price:Number(form.price)}:{}),currency:'TWD',publish:false,consentToMap:details.consent,
    mediaIds,deliveryMethods:[...(details.meetup?['MEETUP']:[]),...(details.shipping?['SHIPPING']:[])],negotiable:details.negotiable,
    ...(location?{location}:{}),...(details.expiryDate?{expiryDate:details.expiryDate}:{})};
}
