import { photoBindingHash, photoCompleteness, parsePhotoInventory, SOURCE_PHOTO_LIMIT, SourcePhotoInventory } from './sourcePhotoInventory';
import { sourceLeadMedia } from './sourceLeadMedia';
export type VerifiedPhotoReceipt={state:'UPLOADED_AND_VERIFIED';archiveItemId:string;sourcePostUrl:string;sourcePhotoId:string;mediaId:string;photoId:string;mappingEvidenceRef:string;rightsBasis:'HANK_USER_DIRECTED'|'SELLER_CONSENT';rightsEvidenceRef:string;uploadReceiptRef:string;verifiedAt:string;flickrOriginal:{source:string};thumbnailSource:string};
// Pure preparation: no fetch, upload, database writes, credentials or invented image URLs.
export function prepareSourcePhotoImport(base:any,inventory:Omit<SourcePhotoInventory,'bindingHash'>,receipts:VerifiedPhotoReceipt[],archive:{version:number;sha256:string},now=Date.now()) {
 const fail=(message:string):never=>{throw new Error(message);};
 if(!base?.evidence||base.archiveItemId!==inventory.archiveItemId||base.canonicalUrl!==inventory.sourceUrl||!Number.isSafeInteger(archive.version)||archive.version<=base.archiveVersion||!/^[a-f0-9]{64}$/.test(archive.sha256))fail('EXACT_NEW_ARCHIVE_REQUIRED');
 parsePhotoInventory({...inventory,bindingHash:'0'.repeat(64)},{archiveItemId:base.archiveItemId,canonicalUrl:base.canonicalUrl},now);
 if(inventory.coverage!=='FULL_POST'||inventory.ambiguities?.length||inventory.photos.some(p=>p.classification==='UNKNOWN'))fail('FULL_ITEM_ASSIGNMENT_REQUIRED');
 const expected=inventory.photos.filter(p=>['SAME_ITEM','ITEM_SPECIFICATION','ITEM_PACKAGING'].includes(p.classification));
 if(!expected.length)fail('NO_CONFIRMED_ITEM_PHOTOS');
 if(expected.length>SOURCE_PHOTO_LIMIT)fail('SOURCE_PHOTO_LIMIT_EXCEEDED');
 if(receipts.length!==expected.length||new Set(receipts.map(r=>r.sourcePhotoId)).size!==receipts.length||new Set(receipts.map(r=>r.mediaId)).size!==receipts.length||new Set(receipts.map(r=>r.photoId)).size!==receipts.length)fail('EXACT_UNIQUE_PHOTO_RECEIPTS_REQUIRED');
 const media=expected.map((photo,sequence)=>{
  const r=receipts.find(r=>r.sourcePhotoId===photo.sourcePhotoId);
  if(!r||r.state!=='UPLOADED_AND_VERIFIED'||r.archiveItemId!==base.archiveItemId||r.sourcePostUrl!==base.canonicalUrl||!r.flickrOriginal?.source)fail('VERIFIED_SAME_ITEM_RECEIPT_REQUIRED');
  return {id:r!.mediaId,archiveItemId:base.archiveItemId,sourceUrl:base.canonicalUrl,sourcePhotoId:photo.sourcePhotoId,permission:'PUBLIC_DISPLAY_AND_STORAGE',rightsBasis:r!.rightsBasis,reviewed:true,storageProvider:'FLICKR',rightsEvidenceRef:r!.rightsEvidenceRef,mappingEvidenceRef:r!.mappingEvidenceRef,uploadReceiptRef:r!.uploadReceiptRef,flickrPhotoId:r!.photoId,imageUrl:r!.flickrOriginal.source,thumbnailUrl:r!.thumbnailSource,sequence,alt:base.title.replace(/^來源線索：/,''),checkedAt:r!.verifiedAt,permissionExpiresAt:new Date(Date.parse(base.checkedAt)+48*3600000).toISOString()};
 });
 const photoInventory={...inventory,bindingHash:photoBindingHash(inventory,media)};
 const row={...structuredClone(base),archiveVersion:archive.version,archiveSha256:archive.sha256,evidence:{...structuredClone(base.evidence),media,photoInventory}};
 const visible=sourceLeadMedia(row,now),status=photoCompleteness(row,visible,now);
 if(status.status!=='IMPORTED_COMPLETE')fail('PHOTO_IMPORT_NOT_COMPLETE');
 return row;
}
