import type {ExternalSourceLead} from '@prisma/client';
import {LeadError,digest,exact,object,publicUrl,ref,parseLead} from './sourceLeadRules';
import {privateContactField,forbiddenListingField} from './listingPolicy';
export const recordFactKeys=['canonicalUrl','title','summary','county','district','publicPlaceName','publicAddress','latitude','longitude','postedEarliestAt','postedLatestAt','checkedAt','evidence','sourceClaimState','stateEvidenceRef'] as const;
const evidenceKeys=['sourceUrl','sourcePublic','publicSourceRef','dateRef','locationRef','coordinateRef','locationSourceUrl','coordinateSourceUrl','publicPlace','locationType','sourceMeetingPointConfirmed','independentlyReviewed','selfWrittenSummary','noCopiedTextOrImages','noPrivateData','reviewRef','publicFacts','coordinateNodeVersion','countyIllustration','sourceCheckRef'];
const boolKeys=['sourcePublic','publicPlace','sourceMeetingPointConfirmed','independentlyReviewed','selfWrittenSummary','noCopiedTextOrImages','noPrivateData'];
const factKeys=['priceText','priceUnitStatus','currencyStatus','sourceAccessNotice','originalDateLabel','locationRelation','coordinateQualityNotes'];
const safeText=(v:unknown,max:number,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||!!v.trim())&&!/[\x00-\x1f\x7f]/.test(v)&&!privateContactField({title:v})&&!forbiddenListingField({title:v});
export function parseRecordFacts(value:unknown,now=new Date()){
 const b=object(value);exact(b,[...recordFactKeys]);
 if(!safeText(b.title,100)||!safeText(b.summary??'',240,true))throw new LeadError('SAFE_SELF_WRITTEN_FACTS_REQUIRED');
 const out:Record<string,any>={canonicalUrl:publicUrl(b.canonicalUrl),title:b.title,summary:b.summary??''};
 for(const k of ['county','district','publicPlaceName','publicAddress']){const v=b[k]??null;if(v!==null&&!safeText(v,k==='publicAddress'?200:100))throw new LeadError('SAFE_PUBLIC_PLACE_REQUIRED');out[k]=v;}
 for(const k of ['latitude','longitude']){const v=b[k]??null;if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<(k==='latitude'?20:117)||v>(k==='latitude'?26.6:123.8)))throw new LeadError('VALID_PUBLIC_COORDINATE_REQUIRED');out[k]=v;}
 for(const k of ['postedEarliestAt','postedLatestAt','checkedAt']){const v=b[k]??null;if(v!==null){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw new LeadError('VALID_SOURCE_TIME_REQUIRED');const normalized=v.replace(/(?:\.(\d{1,3}))?Z$/,(_m,d)=>'.'+(d??'').padEnd(3,'0')+'Z');if(new Date(v).toISOString()!==normalized||Date.parse(v)>+now)throw new LeadError('VALID_SOURCE_TIME_REQUIRED');}out[k]=v;}
 const e=object(b.evidence??{});exact(e,evidenceKeys);
 if(JSON.stringify(e).length>12000)throw new LeadError('BOUNDED_EVIDENCE_REQUIRED');
 for(const k of boolKeys)if(e[k]!==undefined&&typeof e[k]!=='boolean')throw new LeadError('INVALID_EVIDENCE');
 for(const k of ['publicSourceRef','dateRef','locationRef','coordinateRef','reviewRef','sourceCheckRef'])if(e[k]!==undefined&&!ref(e[k]))throw new LeadError('INVALID_EVIDENCE_REFERENCE');
 for(const k of ['sourceUrl','locationSourceUrl','coordinateSourceUrl'])if(e[k]!==undefined)publicUrl(e[k]);
 if(e.sourceUrl!==undefined&&e.sourceUrl!==out.canonicalUrl)throw new LeadError('BOUND_SOURCE_REQUIRED');
 if(e.locationType!==undefined&&e.locationType!=='PUBLIC_MEETING_POINT')throw new LeadError('PUBLIC_MEETING_POINT_REQUIRED');
 if(e.coordinateNodeVersion!==undefined&&(!Number.isSafeInteger(e.coordinateNodeVersion)||e.coordinateNodeVersion<1))throw new LeadError('OSM_PROVENANCE_REQUIRED');
 if(e.countyIllustration!==undefined)throw new LeadError('CONCRETE_PUBLIC_POINT_REQUIRED');
 if(out.publicAddress!==null&&(e.publicPlace!==true||e.noPrivateData!==true))throw new LeadError('PUBLIC_ADDRESS_ONLY');
 if(e.publicFacts!==undefined){const f=object(e.publicFacts);exact(f,factKeys);for(const k of factKeys){if(f[k]===undefined)continue;if(k==='coordinateQualityNotes'){if(!Array.isArray(f[k])||f[k].length>5||f[k].some((v:unknown)=>!safeText(v,500)))throw new LeadError('SAFE_PUBLIC_FACTS_REQUIRED');}else if(!safeText(f[k],300))throw new LeadError('SAFE_PUBLIC_FACTS_REQUIRED');}}
 out.sourceClaimState=b.sourceClaimState??'UNKNOWN';if(!['UNKNOWN','RESERVED','SOLD','WITHDRAWN'].includes(out.sourceClaimState))throw new LeadError('NO_CONFIRMED_STOCK_PROMOTION');out.stateEvidenceRef=b.stateEvidenceRef??null;if(out.stateEvidenceRef!==null&&!ref(out.stateEvidenceRef))throw new LeadError('BOUND_SOURCE_STATE_REQUIRED');if(e.sourceCheckRef!==undefined&&out.checkedAt===null)throw new LeadError('SOURCE_CHECK_TIME_REQUIRED');if(out.sourceClaimState!=='UNKNOWN'&&(!ref(out.stateEvidenceRef)||out.checkedAt===null))throw new LeadError('BOUND_SOURCE_STATE_REQUIRED');
 out.evidence=e;return out;
}
export function recordSnapshot(r:ExternalSourceLead){
 return {...Object.fromEntries(recordFactKeys.map(k=>[k,(r as any)[k]])),id:r.id,archiveItemId:r.archiveItemId,sourceClaimState:r.sourceClaimState,status:r.status,recordOrigin:r.recordOrigin,recordRevision:r.recordRevision,contentHash:r.contentHash,pendingHash:r.pendingHash,pendingFacts:r.pendingFacts,
 legacyArchive:{libraryFileId:r.libraryFileId,version:r.archiveVersion,sha256:r.archiveSha256,historicalOnly:r.recordOrigin==='DB_MASTER'},updatedAt:r.updatedAt};
}
export const recordStateHash=(r:ExternalSourceLead)=>digest(recordSnapshot(r));
export function parseRecordPublication(r:ExternalSourceLead,reviewRef:unknown,now=new Date()){
 if(r.status==='WITHDRAWN')throw new LeadError('WITHDRAWN_RECORD_NOT_REPUBLISHED');
 if(!r.pendingFacts||!r.pendingHash||!ref(reviewRef))throw new LeadError('BOUND_PENDING_REVIEW_REQUIRED');
 const draft=parseRecordFacts(r.pendingFacts,now);if(draft.sourceClaimState!=='UNKNOWN')throw new LeadError('SOURCE_NOT_AVAILABLE_FOR_PUBLIC_REFERENCE');if(digest(draft)!==r.pendingHash)throw new LeadError('PENDING_HASH_MISMATCH');
 const old=object(r.evidence),evidence={...draft.evidence,reviewRef,...(old.media!==undefined?{media:old.media}:{}),...(old.photoInventory!==undefined?{photoInventory:old.photoInventory}:{})};
 const {sourceClaimState:_claim,stateEvidenceRef:_state,...publicFacts}=draft;
 return parseLead({...publicFacts,archiveItemId:r.archiveItemId,libraryFileId:r.libraryFileId,archiveVersion:r.archiveVersion,archiveSha256:r.archiveSha256,evidence},now,true);
}
export const exportCsv=(rows:unknown[][])=>rows.map(row=>row.map(value=>{let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n')+'\r\n';
