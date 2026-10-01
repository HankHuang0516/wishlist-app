import { isIP } from 'net';
import { createHash } from 'crypto';
import { wishId, wishRequestId } from './nativeWishRules';
import { parseWishItemPatch, WishItemUpdateError } from './wishItemUpdate';
import { isListingId } from './listingRules';

export class LegacyWishCreateError extends Error {constructor(public status=400){super('Wish creation rejected');}}
export type LegacyCreateKind='LINK'|'PHOTO';
export const legacyCreateKinds:LegacyCreateKind[]=['LINK','PHOTO'];
export function legacyCreateIdentity(raw:unknown){try{return wishRequestId(raw);}catch{throw new LegacyWishCreateError();}}
export function legacyCreateId(raw:unknown){try{return wishId(raw);}catch{throw new LegacyWishCreateError();}}
export function legacyCreateHash(kind:LegacyCreateKind,wishlistId:number,data:object) {
  return createHash('sha256').update(JSON.stringify(['legacy-create-v1',kind,wishlistId,data])).digest('hex');
}
export function parseLegacyWishCreate(raw:unknown,kind:LegacyCreateKind,proxy:string|null=null) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new LegacyWishCreateError();
  const body=raw as Record<string,unknown>,keys=['url','mediaId','name','notes','price','currency','maxPrice','priceCurrency','clientRequestId','requestHash','proxy_end_user_id'];
  if(Object.keys(body).some(key=>!keys.includes(key)))throw new LegacyWishCreateError();
  const clientRequestId=body.clientRequestId===undefined?null:legacyCreateIdentity(body.clientRequestId);
  const requestHash=body.requestHash===undefined?null:body.requestHash;
  if(requestHash!==null && (!clientRequestId || typeof requestHash!=='string' || !/^[a-f0-9]{64}$/.test(requestHash)))throw new LegacyWishCreateError();
  let link:string|null=null,sourceName='',mediaId:string|null=null,aiStatus='SKIPPED',aiError:string|null=null;
  if(kind==='LINK') {
    if(body.mediaId!==undefined || typeof body.url!=='string' || !body.url.trim() || body.url.length>2000 || /[\u0000-\u001f\u007f]/.test(body.url))throw new LegacyWishCreateError();
    const value=body.url.trim();
    if(/^https?:\/\//i.test(value)) {
      let url:URL;try{url=new URL(value);}catch{throw new LegacyWishCreateError();}
      const host=url.hostname.toLowerCase();
      // No request-time website fetch occurs. Keep private/credential URLs out
      // of the downstream recognition input and reject ambiguous local names.
      if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port || isIP(host) || !host.includes('.') || /[^a-z0-9.-]/.test(host) || host==='localhost' || /\.(localhost|local|internal|test|invalid)$/.test(host))throw new LegacyWishCreateError();
      link=url.href;sourceName='Processing Link...';
      if(url.protocol==='https:')aiStatus='PENDING';else aiError='HTTPS_REQUIRED';
    }else {
      if(value.length>200 || /^[a-z][a-z0-9+.-]*:/i.test(value))throw new LegacyWishCreateError();
      sourceName=value;
    }
  }else {
    if(body.url!==undefined || !isListingId(body.mediaId) || body.proxy_end_user_id!==undefined || !clientRequestId)throw new LegacyWishCreateError();
    mediaId=(body.mediaId as string).toLowerCase();sourceName='Photo wish';aiStatus='PENDING';
  }
  const patchInput={name:body.name===undefined || body.name===''?sourceName:body.name,...Object.fromEntries(['notes','price','currency','maxPrice','priceCurrency'].filter(key=>body[key]!==undefined).map(key=>[key,body[key]]))};
  let patch;try{patch=parseWishItemPatch(patchInput);}catch(error){if(error instanceof WishItemUpdateError)throw new LegacyWishCreateError();throw error;}
  if(patch.maxPrice==null && patch.priceCurrency!==undefined)throw new LegacyWishCreateError();
  const data={name:patch.name!,notes:patch.notes??null,price:patch.price??null,currency:patch.currency??'TWD',maxPrice:patch.maxPrice??null,priceCurrency:patch.maxPrice==null?null:patch.priceCurrency??'TWD',link,mediaId,proxy_end_user_id:proxy,aiStatus,aiError};
  return {clientRequestId,expectedHash:requestHash as string|null,data};
}
