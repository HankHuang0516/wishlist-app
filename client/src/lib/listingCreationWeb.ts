import { getFullApiUrl } from '../config';
import { api } from './marketplaceApi';
import { isUuid, listingCategories } from './listingBatch';
import { parseManagedListing, type ManagedListing } from './managedListingWeb';
import { sha256, type PendingStore } from './webPendingStore';

export class ListingCreationWebError extends Error { constructor() { super('刊登原操作資料或回執不正確；請重新安全查核，不會重建商品。'); } }
const fail = (): never => { throw new ListingCreationWebError(); };
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(); }
function keys(row: Record<string, unknown>, allowed: string[], exact = false) {
  if (Object.keys(row).some(key => !allowed.includes(key)) || exact && Object.keys(row).length !== allowed.length) fail();
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return fail();
  return value.trim();
}
const uuid = (value: unknown) => isUuid(value) && value === value.toLowerCase();
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const finite = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

/** Published web requests only. Draft creation retains the native API contract.
 * Matches parseListingCreate's immutable canonical hash, not current listing
 * fields. Old dates remain valid for restore; new publication is checked by UI
 * and server. A journal may never carry precise/private meetup coordinates. */
function publication(value: unknown) {
  const row = record(value);
  keys(row, ['clientListingId','title','description','condition','category','brand','price','currency','deliveryMethods','negotiable','location','mediaIds','expiryDate','publish','consentToMap','mapCheckIn']);
  if (!uuid(row.clientListingId) || row.publish !== true || typeof row.consentToMap !== 'boolean' || row.mapCheckIn !== undefined && typeof row.mapCheckIn !== 'boolean' || row.mapCheckIn === true && row.consentToMap !== true || row.currency !== 'TWD'
    || !finite(row.price,0,9_999_999_999.99) || Math.abs(row.price*100-Math.round(row.price*100)) > .001
    || !['USED','NEW'].includes(String(row.condition)) || !listingCategories.some(item => item[0] === row.category)
    || !Array.isArray(row.deliveryMethods) || row.deliveryMethods.length < 1 || row.deliveryMethods.length > 2 || row.deliveryMethods.some(v=>v!=='MEETUP'&&v!=='SHIPPING') || new Set(row.deliveryMethods).size !== row.deliveryMethods.length
    || !Array.isArray(row.mediaIds) || row.mediaIds.length < 1 || row.mediaIds.length > 8 || row.mediaIds.some(v=>!uuid(v)) || new Set(row.mediaIds).size !== row.mediaIds.length
    || typeof row.negotiable !== 'boolean') return fail();
  const location = record(row.location); keys(location,['county','district','latitude','longitude'],true);
  const county = text(location.county,30), district = text(location.district,30);
  if (!finite(location.latitude,20,26.6) || !finite(location.longitude,117,123.8)) return fail();
  const publicLatitude = Number(Math.min(26.59,Math.floor(location.latitude/.02)*.02+.01).toFixed(2));
  const publicLongitude = Number(Math.min(123.79,Math.floor(location.longitude/.02)*.02+.01).toFixed(2));
  if (publicLatitude !== location.latitude || publicLongitude !== location.longitude) return fail();
  if (row.expiryDate !== undefined && (typeof row.expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate) || row.expiryDate < '2000-01-01' || !Number.isFinite(Date.parse(row.expiryDate)) || new Date(row.expiryDate).toISOString().slice(0,10) !== row.expiryDate)) return fail();
  const normalized = { title:text(row.title,100),description:text(row.description,3000),condition:row.condition,category:row.category,
    brand:row.brand===undefined?null:text(row.brand,60),price:row.price,currency:'TWD',deliveryMethods:row.deliveryMethods,negotiable:row.negotiable,status:'ACTIVE',
    expiryMode:row.expiryDate===undefined?'DEFAULT_30_DAYS':'CUSTOM_DATE',expiryDate:row.expiryDate,
    location:{county,district,publicLatitude,publicLongitude,precisionMeters:2200},mediaIds:row.mediaIds,consentToMap:row.consentToMap,...(row.mapCheckIn !== undefined ? {mapCheckIn:row.mapCheckIn} : {}) };
  return { payload:row, normalized };
}
/** Separate envelope: a draft can never weaken the v1 publication gate. */
function draftCreation(value: unknown) {
  const row=record(value);
  keys(row,['clientListingId','title','description','condition','category','brand','price','currency','deliveryMethods','negotiable','location','mediaIds','expiryDate','publish','consentToMap']);
  if(!uuid(row.clientListingId)||row.publish!==false||typeof row.consentToMap!=='boolean'||row.currency!=='TWD'
    ||!['USED','NEW'].includes(String(row.condition))||!listingCategories.some(item=>item[0]===row.category)||typeof row.negotiable!=='boolean'
    ||row.price!==undefined&&(!finite(row.price,0,9_999_999_999.99)||Math.abs(row.price*100-Math.round(row.price*100))>.001)
    ||!Array.isArray(row.deliveryMethods)||row.deliveryMethods.length>2||row.deliveryMethods.some(v=>v!=='MEETUP'&&v!=='SHIPPING')||new Set(row.deliveryMethods).size!==row.deliveryMethods.length
    ||!Array.isArray(row.mediaIds)||row.mediaIds.length>8||row.mediaIds.some(v=>!uuid(v))||new Set(row.mediaIds).size!==row.mediaIds.length)return fail();
  let location;
  if(row.location!==undefined){const loc=record(row.location);keys(loc,['county','district','latitude','longitude'],true);
    if(!finite(loc.latitude,20,26.6)||!finite(loc.longitude,117,123.8))return fail();
    const publicLatitude=Number(Math.min(26.59,Math.floor(loc.latitude/.02)*.02+.01).toFixed(2));
    const publicLongitude=Number(Math.min(123.79,Math.floor(loc.longitude/.02)*.02+.01).toFixed(2));
    if(publicLatitude!==loc.latitude||publicLongitude!==loc.longitude)return fail();
    location={county:text(loc.county,30),district:text(loc.district,30),publicLatitude,publicLongitude,precisionMeters:2200};}
  if(row.expiryDate!==undefined&&(typeof row.expiryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate)||row.expiryDate<'2000-01-01'||!Number.isFinite(Date.parse(row.expiryDate))||new Date(row.expiryDate).toISOString().slice(0,10)!==row.expiryDate))return fail();
  const normalized={title:text(row.title,100),description:row.description===undefined?null:text(row.description,3000),condition:row.condition,category:row.category,
    brand:row.brand===undefined?null:text(row.brand,60),price:row.price??null,currency:'TWD',deliveryMethods:row.deliveryMethods,negotiable:row.negotiable,status:'DRAFT',
    expiryMode:row.expiryDate===undefined?'DEFAULT_30_DAYS':'CUSTOM_DATE',expiryDate:row.expiryDate,location,mediaIds:row.mediaIds,consentToMap:row.consentToMap};
  return {payload:row,normalized};
}
export type ListingCreationJournal = { version:1|2; kind?:'DRAFT'; payload:Record<string,unknown>; requestHash:string };
export async function draftListingCreationJournal(body:string) {
  let value;try{value=JSON.parse(body);}catch{return fail();}
  const parsed=draftCreation(value);
  return JSON.stringify({version:2,kind:'DRAFT',payload:parsed.payload,requestHash:await sha256(JSON.stringify(parsed.normalized))});
}
export async function listingCreationJournal(body:string) {
  let value; try { value=JSON.parse(body); } catch { return fail(); }
  const parsed=publication(value);
  return JSON.stringify({ version:1,payload:parsed.payload,requestHash:await sha256(JSON.stringify(parsed.normalized)) });
}
export async function parseListingCreationJournal(raw:string): Promise<ListingCreationJournal> {
  let value; try { value=record(JSON.parse(raw)); } catch { return fail(); }
  keys(value,value.version===2?['version','kind','payload','requestHash']:['version','payload','requestHash'],true);
  if(value.version!==1&&(value.version!==2||value.kind!=='DRAFT'))return fail();
  const parsed=value.version===2?draftCreation(value.payload):publication(value.payload);
  if(typeof value.requestHash!=='string'||value.requestHash!==await sha256(JSON.stringify(parsed.normalized)))return fail();
  return value as ListingCreationJournal;
}
export function strictCreatedListing(value:unknown,userId:number):ManagedListing {
  const row=record(value);
  keys(row,['id','ownerUserId','title','description','condition','category','brand','price','currency','deliveryMethods','negotiable','status','publishedAt','expiresAt','expiryMode','lastVerifiedAt',...(row.mapVisibleUntil !== undefined ? ['mapVisibleUntil'] : []),'createdAt','updatedAt','version','owner','location','media'],true);
  if (!(row.mapVisibleUntil === undefined || row.mapVisibleUntil === null || date(row.mapVisibleUntil))) return fail();
  const owner=record(row.owner); keys(owner,['id','name'],true);
  if(!(owner.name===null||typeof owner.name==='string') || !['DEFAULT_30_DAYS','CUSTOM_DATE'].includes(String(row.expiryMode)) || typeof row.negotiable!=='boolean'
    || !(row.brand===null||typeof row.brand==='string'&&row.brand.length<=60) || !date(row.updatedAt) || !date(row.createdAt)
    || ![row.publishedAt,row.expiresAt,row.lastVerifiedAt].every(v=>v===null||date(v)) || !Array.isArray(row.deliveryMethods)||row.deliveryMethods.length>2||row.deliveryMethods.some(v=>v!=='MEETUP'&&v!=='SHIPPING')||new Set(row.deliveryMethods).size!==row.deliveryMethods.length
    || !Array.isArray(row.media))return fail();
  if(row.location!==null){const loc=record(row.location);keys(loc,['county','district','publicLatitude','publicLongitude','precisionMeters'],true);
    if(!finite(loc.publicLatitude,20,26.6)||!finite(loc.publicLongitude,117,123.8)||loc.precisionMeters!==2200)return fail();}
  const apiUrl=getFullApiUrl(),base=apiUrl.replace(/\/api\/?$/,'');
  row.media.forEach(value=>{const image=record(value);keys(image,['id','imageUrl','thumbnailUrl','position','capturePurpose'],true);
    if(!uuid(image.id)||image.imageUrl!==`${base}/api/listing-media/${image.id}/image`||!Number.isSafeInteger(image.position)||Number(image.position)<0||Number(image.position)>7||!['LEGACY_UNKNOWN','MANUAL_PHOTO','BATCH_ITEM','AI_MARKETING'].includes(String(image.capturePurpose)))fail();});
  return parseManagedListing(row,userId,apiUrl,import.meta.env.DEV);
}
export type ListingCreationResult = { state:'CREATED'|'ABANDONED'; listingId:string|null; listing:ManagedListing|null };
export async function listingCreationResult(value:unknown,raw:string,userId:number):Promise<ListingCreationResult> {
  const journal=await parseListingCreationJournal(raw),row=record(value);keys(row,['receipt','listing'],true);
  const receipt=record(row.receipt);keys(receipt,['clientListingId','requestHash','state','listingId','createdAt'],true);
  if(receipt.clientListingId!==journal.payload.clientListingId||receipt.requestHash!==journal.requestHash||!date(receipt.createdAt)||!['CREATED','ABANDONED'].includes(String(receipt.state)))return fail();
  if(receipt.state==='ABANDONED') {if(receipt.listingId!==null||row.listing!==null)return fail();return {state:'ABANDONED',listingId:null,listing:null};}
  if(!uuid(receipt.listingId))return fail();
  const listing=row.listing===null?null:strictCreatedListing(row.listing,userId);
  if(listing&&listing.id!==receipt.listingId)return fail();
  return {state:'CREATED',listingId:receipt.listingId as string,listing};
}
export async function readListingCreation(token:string,raw:string,userId:number,active:()=>boolean=()=>true) {
  const journal=await parseListingCreationJournal(raw);
  if(!active())throw new ListingCreationWebError();
  return listingCreationResult(await api(token,'/listings/creation-receipts/'+journal.payload.clientListingId),raw,userId);
}
export async function sendListingCreation(token:string,raw:string,userId:number,store:PendingStore,key:string,active:()=>boolean) {
  const journal=await parseListingCreationJournal(raw);await store.save(key,raw);if(!active())throw new ListingCreationWebError();
  const created=strictCreatedListing(await api(token,'/listings',{method:'POST',body:JSON.stringify(journal.payload)}),userId);
  if(!active())throw new ListingCreationWebError();
  const result=await readListingCreation(token,raw,userId,active);
  if(result.state!=='CREATED'||result.listingId!==created.id)return fail();return result;
}
export async function abandonListingCreation(token:string,raw:string,userId:number,active:()=>boolean) {
  const journal=await parseListingCreationJournal(raw);if(!active())throw new ListingCreationWebError();
  return listingCreationResult(await api(token,'/listings/creation-receipts/'+journal.payload.clientListingId+'/abandon',{method:'POST',body:JSON.stringify({requestHash:journal.requestHash})}),raw,userId);
}
