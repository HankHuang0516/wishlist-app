export type RegistryEntry={archiveItemId:string;facts:Record<string,any>;sourceReceiptJson:string;coordinateEvidence?:{sourceUrl:string;nodeXml:string;readReceiptRef:string}|null};
const recordKeys=['canonicalUrl','title','summary','county','district','publicPlaceName','publicAddress','latitude','longitude','postedEarliestAt','postedLatestAt','checkedAt','evidence','sourceClaimState','stateEvidenceRef'];
const evidenceKeys=['sourceUrl','sourcePublic','publicSourceRef','dateRef','locationRef','coordinateRef','locationSourceUrl','coordinateSourceUrl','publicPlace','locationType','sourceMeetingPointConfirmed','independentlyReviewed','selfWrittenSummary','noCopiedTextOrImages','noPrivateData','reviewRef','publicFacts','coordinateNodeVersion','sourceCheckRef'];
const obj=(v:any)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('JSON_OBJECT_REQUIRED');return v;};
const exact=(v:any,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('UNSUPPORTED_EVIDENCE_FIELDS');};
const secret=/"(?:password|token|secret|authorization|cookie|api[_-]?key|botSecret|access_token|refresh_token)"\s*:/i;
export function decodeEvidenceBytes(bytes:ArrayBuffer,max:number){if(bytes.byteLength>max)throw Error('EVIDENCE_FILE_TOO_LARGE');const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),round=new TextEncoder().encode(raw),original=new Uint8Array(bytes);if(round.length!==original.length||round.some((b,i)=>b!==original[i]))throw Error('EXACT_UTF8_REQUIRED');return raw;}
export async function evidenceSha(raw:string){const bytes=new TextEncoder().encode(raw),hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
export async function parseRegistryManifest(raw:string):Promise<RegistryEntry[]>{
 if(new TextEncoder().encode(raw).length>2*1024*1024||secret.test(raw))throw Error('BOUNDED_NON_SECRET_EVIDENCE_REQUIRED');
 const b=obj(JSON.parse(raw));exact(b,['entries']);if(!Array.isArray(b.entries)||b.entries.length<1||b.entries.length>20)throw Error('ONE_TO_20_SOURCE_EVIDENCE_REQUIRED');
 const ids=new Set<string>();for(const value of b.entries){const e=obj(value);exact(e,['archiveItemId','facts','sourceReceiptJson','coordinateEvidence']);if(typeof e.archiveItemId!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/.test(e.archiveItemId)||ids.has(e.archiveItemId))throw Error('UNIQUE_ARCHIVE_IDS_REQUIRED');ids.add(e.archiveItemId);obj(e.facts);
  if(typeof e.sourceReceiptJson!=='string'||e.sourceReceiptJson.length>50000||secret.test(e.sourceReceiptJson))throw Error('BOUNDED_NON_SECRET_EVIDENCE_REQUIRED');
  obj(JSON.parse(e.sourceReceiptJson));
  if(e.facts.evidence?.sourceCheckRef!=='source:'+await evidenceSha(e.sourceReceiptJson))throw Error('SOURCE_RECEIPT_HASH_MISMATCH');
  if(e.coordinateEvidence){const c=obj(e.coordinateEvidence);exact(c,['sourceUrl','nodeXml','readReceiptRef']);if(typeof c.nodeXml!=='string'||c.nodeXml.length>20000||/<!DOCTYPE|<!ENTITY/i.test(c.nodeXml))throw Error('COORDINATE_XML_REQUIRED');}
 }
 return b.entries;
}
export function registryRecordFacts(doc:any){const source=doc.pendingFacts??doc,facts=Object.fromEntries(recordKeys.map(k=>[k,source[k]??(k==='evidence'?{}:null)]));facts.evidence=Object.fromEntries(evidenceKeys.filter(k=>source.evidence?.[k]!==undefined).map(k=>[k,source.evidence[k]]));return facts;}
export async function registryEntryFromFiles(doc:any,sourceRaw:string,coordinateRaw:string,readReceiptRef:string,sourceExpectedSha='',coordinateExpectedSha=''):Promise<RegistryEntry>{
 if(secret.test(sourceRaw)||secret.test(coordinateRaw))throw Error('BOUNDED_NON_SECRET_EVIDENCE_REQUIRED');
 const source=obj(JSON.parse(sourceRaw)),hash=await evidenceSha(sourceRaw);if(sourceExpectedSha&&sourceExpectedSha!==hash)throw Error('SOURCE_RECEIPT_HASH_MISMATCH');
 const facts=registryRecordFacts(doc),items=source.items??source.observations,item=Array.isArray(items)?items.find((v:any)=>v.sourceKey===doc.archiveItemId||v.archiveItemId===doc.archiveItemId||v.item_id===doc.archiveItemId):null;
 if(!item||source.source?.canonicalUrl!==facts.canonicalUrl)throw Error('BOUND_SOURCE_ITEM_REQUIRED');
 facts.checkedAt=source.actualCheckedAt??source.checked_at_utc;if(typeof facts.checkedAt!=='string')throw Error('ACTUAL_SOURCE_READ_TIME_REQUIRED');
 facts.title=item.name; if(typeof item.summary==='string')facts.summary=item.summary;
 const exactDate=source.source?.exactOriginalPostedAtUtc;
 if(exactDate){facts.postedEarliestAt=exactDate;facts.postedLatestAt=exactDate;}
 else if(item.adminRecord){facts.postedEarliestAt=item.adminRecord.existingPostedEarliestAt;facts.postedLatestAt=item.adminRecord.existingPostedLatestAt;}
 const e=facts.evidence;e.sourceUrl=facts.canonicalUrl;e.sourceCheckRef='source:'+hash;
 const p=item.sourceMarkedPrice;e.publicFacts={...e.publicFacts};
 if(p&&typeof p.amount==='number'){e.publicFacts.priceText='原帖標價：'+p.amount+'元；庫存與交易待確認';e.publicFacts.priceUnitStatus='計價單位、運費與成交總額未核實';e.publicFacts.currencyStatus=p.currency==='TWD'?'來源明示TWD／NT；非即時報價':'來源幣別待核實';}
 if(source.source?.originalPostedDisplay)e.publicFacts.originalDateLabel=source.source.originalPostedDisplay+(source.source.originalPostedTimeZone==='unknown'?'（顯示時區未知，不推算精確UTC）':'');
 const point=source.publicMeetingPoint;if(point){facts.county=point.county;facts.district=point.district;facts.publicAddress=point.publicAddress;facts.publicPlaceName=point.normalizedPlaceName??facts.publicPlaceName;}
 let coordinateEvidence:RegistryEntry['coordinateEvidence']=null;
 if(coordinateRaw){
  const envelope=obj(JSON.parse(coordinateRaw)),c=obj(envelope.coordinateEvidence??envelope);
  if(typeof c.nodeXml!=='string')throw Error('COORDINATE_XML_REQUIRED');const xmlHash=await evidenceSha(c.nodeXml),declared=c.rawSha256??envelope.httpRead?.sha256;
  if(declared&&declared!==xmlHash||coordinateExpectedSha&&coordinateExpectedSha!==xmlHash)throw Error('COORDINATE_XML_HASH_MISMATCH');
  if(!readReceiptRef)throw Error('ACTUAL_COORDINATE_RECEIPT_REFERENCE_REQUIRED');
  coordinateEvidence={sourceUrl:c.sourceUrl,nodeXml:c.nodeXml,readReceiptRef};
  const node=c.nodeXml.match(/<node\b[^>]*>/)?.[0]??'',id=node.match(/\bid=["'](\d+)["']/)?.[1],version=node.match(/\bversion=["'](\d+)["']/)?.[1];
  if(id&&version){e.coordinateSourceUrl='https://www.openstreetmap.org/node/'+id;e.coordinateNodeVersion=Number(version);}
  // Never infer or replace the stored point/coordinates from an XML upload.
 }
 const entry={archiveItemId:doc.archiveItemId,facts,sourceReceiptJson:sourceRaw,coordinateEvidence};
 await parseRegistryManifest(JSON.stringify({entries:[entry]}));return entry;
}
const labels:Record<string,string>={
 PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT:'座標來源行政區與公共點資料衝突，原始材料保留，等待獨立核實。',
 PUBLIC_COORDINATE_CITY_CONFLICT:'座標來源縣市與公共點資料衝突。',
 PUBLIC_COORDINATE_MATERIAL_REQUIRED:'缺少合法原始座標材料。',
 PUBLIC_COORDINATE_MATERIAL_MISMATCH:'座標讀取URL、node版本或經緯度與本件資料不一致。',
 SOURCE_EVIDENCE_EXPIRED:'來源查核已超過48小時，不能刷新時間代替查核。',
 SOURCE_RECEIPT_HASH_MISMATCH:'來源原件SHA-256不一致；請取得正確原件，不修改收據。',
 COORDINATE_XML_HASH_MISMATCH:'座標XML原件SHA-256不一致，未送出。',
 ACTUAL_COORDINATE_RECEIPT_REFERENCE_REQUIRED:'請提供實際座標觀測收據引用；不能編造伺服器收據。',
 BOUND_SOURCE_ITEM_REQUIRED:'原件的來源或商品ID與目前資料不一致。',
 UNSUPPORTED_EVIDENCE_FIELDS:'包含不支援欄位；不能自行指定verified或issuer。',
 BOUNDED_NON_SECRET_EVIDENCE_REQUIRED:'材料過大或包含禁止的憑證欄位；未送出。',
};
export const registryIssue=(code:string)=>labels[code]??(/^[A-Z0-9_]{1,100}$/.test(code)?'待查核：'+code:'證據格式尚未確認，未送出。');
