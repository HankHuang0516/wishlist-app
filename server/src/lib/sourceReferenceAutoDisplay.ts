import { SOURCE_VALIDITY_MS } from './sourceValidity';
import {createHash} from 'node:crypto';
import {LeadError,digest,object,publicUrl,ref,exact} from './sourceLeadRules';
import {parseRecordFacts} from './sourceLeadRecords';
export const AUTO_REFERENCE_SCOPE='SOURCE_REFERENCE_AUTO_DISPLAY';
export const REFERENCE_VERIFIER_SCOPE='SOURCE_REFERENCE_EVIDENCE_VERIFIER';
export const canAutoReference=(scope:unknown)=>scope===AUTO_REFERENCE_SCOPE||scope===REFERENCE_VERIFIER_SCOPE;
export const AUTO_REFERENCE_RULE='REFERENCE_EVIDENCE_V1';
export const rawSha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const clean=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').replace(/\s+/g,''):'';
const priceMatches=(text:unknown,amount:unknown)=>typeof text==='string'&&typeof amount==='number'&&Number.isFinite(amount)&&new RegExp('(^|[^0-9])'+String(amount)+'([^0-9]|$)').test(text.replace(/,/g,''));
export function parseSourceEvidence(input:unknown){
 const b=object(input);exact(b,['archiveItemId','facts','sourceReceiptJson','coordinateEvidence']);
 if(typeof b.archiveItemId!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/.test(b.archiveItemId)||typeof b.sourceReceiptJson!=='string'||b.sourceReceiptJson.length>50000)throw new LeadError('SOURCE_EVIDENCE_INPUT_INVALID');
 if(/"(?:password|token|secret|authorization|cookie|api[_-]?key|botSecret|access_token|refresh_token)"\s*:/i.test(b.sourceReceiptJson))throw new LeadError('SOURCE_EVIDENCE_SENSITIVE_INPUT');
 const facts=parseRecordFacts(b.facts),materialSha=rawSha(b.sourceReceiptJson),material=object(JSON.parse(b.sourceReceiptJson));
 const source=object(material.source??{}),url=source.canonicalUrl??material.source_url,time=material.actualCheckedAt??material.checked_at_utc;
 const entries=material.items??material.observations;
 if(!Array.isArray(entries)||entries.length>20)throw new LeadError('SOURCE_EVIDENCE_ITEMS_REQUIRED');
 const item=entries.find((r:any)=>r.sourceKey===b.archiveItemId||r.item_id===b.archiveItemId||r.archiveItemId===b.archiveItemId);
 if(!item||publicUrl(url)!==facts.canonicalUrl||time!==facts.checkedAt||facts.evidence.sourceCheckRef!=='source:'+materialSha)throw new LeadError('SOURCE_EVIDENCE_BOUND_READ_REQUIRED');
 const issues:string[]=[];
 if(!clean(facts.title).includes(clean(item.name))||!clean(item.name))issues.push('SOURCE_TITLE_EVIDENCE_MISMATCH');
 if(item.summary!==undefined&&facts.summary!==item.summary)issues.push('SELF_WRITTEN_SUMMARY_EVIDENCE_MISMATCH');
 const marked=item.sourceMarkedPrice??{amount:item.visible_price,currency:item.currency};
 if(!priceMatches(facts.evidence.publicFacts?.priceText,marked.amount))issues.push('SOURCE_PRICE_EVIDENCE_MISMATCH');
 if(marked.currency==='TWD'&&!/TWD|NT/i.test(facts.evidence.publicFacts?.currencyStatus??''))issues.push('SOURCE_CURRENCY_EVIDENCE_REQUIRED');
 const original=source.originalPostedDisplay??material.shared_visible_evidence?.original_publication_label;
 if(!original||!clean(facts.evidence.publicFacts?.originalDateLabel).replace(/星期[一二三四五六日天]/g,'').includes(clean(original).replace(/星期[一二三四五六日天]/g,'')))issues.push('ORIGINAL_PUBLICATION_LABEL_EVIDENCE_REQUIRED');
 const exactDate=source.exactOriginalPostedAtUtc??material.shared_visible_evidence?.exactOriginalPostedAtUtc;
 const baseline=item.adminRecord;
 if(exactDate?(facts.postedEarliestAt!==exactDate||facts.postedLatestAt!==exactDate):(!baseline||facts.postedEarliestAt!==baseline.existingPostedEarliestAt||facts.postedLatestAt!==baseline.existingPostedLatestAt))issues.push('ORIGINAL_DATE_BOUNDS_EVIDENCE_REQUIRED');
 const point=material.publicMeetingPoint;
 if(!point||point.publicLocation!==true||point.publicAddress!==facts.publicAddress||point.county!==facts.county||point.district!==facts.district||!point.officialAddressEvidence?.url||point.officialAddressEvidence.observedDuringThisRun!==true)issues.push('PUBLIC_POINT_ADDRESS_EVIDENCE_REQUIRED');
 let coordinateSha:string|null=null,coordinateReadUrl:string|null=null,coordinateReadReceiptRef:string|null=null,coordinateFindings:Record<string,string|null>|null=null;
 if(b.coordinateEvidence===undefined||b.coordinateEvidence===null)issues.push('PUBLIC_COORDINATE_MATERIAL_REQUIRED');
 else{
  const c=object(b.coordinateEvidence);exact(c,['sourceUrl','nodeXml','readReceiptRef']);
  if(typeof c.nodeXml!=='string'||c.nodeXml.length>20000||!ref(c.readReceiptRef)||/<!DOCTYPE|<!ENTITY/i.test(c.nodeXml))throw new LeadError('PUBLIC_COORDINATE_MATERIAL_INVALID');
  const matches=c.nodeXml.match(/<node\b[^>]*>/g)??[],tag=matches.length===1?matches[0]:'';
  const attr=(key:string)=>tag.match(new RegExp("\\b"+key+"=[\"']([^\"']+)[\"']"))?.[1];
  const nodeId=attr('id');if(attr('visible')==='false')issues.push('PUBLIC_COORDINATE_MATERIAL_WITHDRAWN');
  coordinateReadUrl=publicUrl(c.sourceUrl);coordinateReadReceiptRef=c.readReceiptRef;
  const human='https://www.openstreetmap.org/node/'+nodeId;
  const officialReads=[human,'https://api.openstreetmap.org/api/0.6/node/'+nodeId,'https://www.openstreetmap.org/api/0.6/node/'+nodeId];
  if(!nodeId||!officialReads.includes(coordinateReadUrl)||facts.evidence.coordinateSourceUrl!==human||Number(attr('version'))!==facts.evidence.coordinateNodeVersion||Number(attr('lat'))!==facts.latitude||Number(attr('lon'))!==facts.longitude)issues.push('PUBLIC_COORDINATE_MATERIAL_MISMATCH');
  const xmlText=(value:string)=>value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const tags=new Map<string,string>();
  for(const t of c.nodeXml.match(/<tag\b[^>]*>/g)??[]){const a=(key:string)=>t.match(new RegExp("\\b"+key+"=[\"']([^\"']+)[\"']"))?.[1];if(a('k')&&a('v'))tags.set(xmlText(a('k')!),xmlText(a('v')!));}
  const normal=(value:unknown)=>clean(value).replace(/台/g,'臺');
  const region=(value:unknown)=>typeof value==='string'&&/^[\u3400-\u9fff]{1,30}$/.test(value)?value:null;
  coordinateFindings={observedDistrict:region(tags.get('addr:district')),observedCounty:region(tags.get('addr:city')),expectedDistrict:region(facts.district),expectedCounty:region(facts.county)};
  if(tags.has('addr:district')&&normal(tags.get('addr:district'))!==normal(facts.district))issues.push('PUBLIC_COORDINATE_ADMINISTRATIVE_CONFLICT');
  if(tags.has('addr:city')&&normal(tags.get('addr:city'))!==normal(facts.county))issues.push('PUBLIC_COORDINATE_CITY_CONFLICT');
  if(tags.has('addr:country')&&tags.get('addr:country')!=='TW')issues.push('PUBLIC_COORDINATE_COUNTRY_CONFLICT');
  coordinateSha=rawSha(c.nodeXml);
 }
 if(facts.sourceClaimState!=='UNKNOWN'||item.soldEvidence||item.reservedEvidence||item.withdrawnEvidence)issues.push('SOURCE_UNAVAILABLE_OR_STATE_EVIDENCE');
 if(![facts.evidence.sourcePublic,facts.evidence.publicPlace,facts.evidence.sourceMeetingPointConfirmed,facts.evidence.noPrivateData,facts.evidence.noCopiedTextOrImages,facts.evidence.selfWrittenSummary,facts.evidence.independentlyReviewed].every(v=>v===true)||!ref(facts.evidence.reviewRef))issues.push('INDEPENDENT_SOURCE_PROVENANCE_REQUIRED');
 const factsHash=digest({archiveItemId:b.archiveItemId,facts});
 const receiptRef='source:evidence/'+digest({archiveItemId:b.archiveItemId,factsHash,materialSha,coordinateSha,coordinateReadUrl,coordinateReadReceiptRef});
 return {archiveItemId:b.archiveItemId,canonicalUrl:facts.canonicalUrl,checkedAt:new Date(facts.checkedAt),sourceCheckRef:facts.evidence.sourceCheckRef,factsHash,facts,materialSha,coordinateSha,coordinateReadUrl,coordinateReadReceiptRef,coordinateFindings,receiptRef,issues,verified:issues.length===0};
}
export async function validateAutoReference(tx:any,row:any,receiptRef:unknown){
 if(typeof receiptRef!=='string'||!/^source:evidence\/[a-f0-9]{64}$/.test(receiptRef))return {ok:false,reason:'TRUSTED_SOURCE_EVIDENCE_REQUIRED'};
 const evidence=await tx.sourceReferenceEvidence.findUnique({where:{receiptRef}});
 if(!evidence||!['EXISTING_SOURCE_ADMIN','SOURCE_SESSION_VERIFIER'].includes(evidence.issuer)||!evidence.verified)return {ok:false,reason:'TRUSTED_SOURCE_EVIDENCE_INCOMPLETE'};
 const facts=parseRecordFacts(row.pendingFacts);
 if(evidence.archiveItemId!==row.archiveItemId||evidence.canonicalUrl!==row.canonicalUrl||evidence.factsHash!==digest({archiveItemId:row.archiveItemId,facts})||+evidence.checkedAt!==Date.parse(facts.checkedAt))return {ok:false,reason:'SOURCE_EVIDENCE_FACTS_OR_TIME_MISMATCH'};
 if(Date.now()-+evidence.checkedAt>SOURCE_VALIDITY_MS||+evidence.checkedAt>Date.now())return {ok:false,reason:'SOURCE_EVIDENCE_EXPIRED'};
 const old=object(row.evidence);
 if(Array.isArray(old.media)&&old.media.length)return {ok:false,reason:'EXISTING_MEDIA_REQUIRES_RIGHTS_REVIEW'};
 return {ok:true,reason:null,evidence};
}
