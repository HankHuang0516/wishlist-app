import { SOURCE_VALIDITY_MS } from './sourceValidity';
import { createHmac, timingSafeEqual } from 'crypto';
import { photoBindingHash, photoCompleteness, parsePhotoInventory, SOURCE_PHOTO_LIMIT } from './sourcePhotoInventory';
import { sourceLeadMedia } from './sourceLeadMedia';
import { validatedFlickrSource } from './listingFlickrStorage';
import { isListingId } from './listingRules';
import { LeadError } from './sourceLeadRules';

// Photos for DB master records: each FB post photo is backed up to Flickr (Hank 2026-10-22, FB thumbnails
// do not load off-site), then the reviewed per-item assignment binds them to the record.
export type PhotoUploadReceipt = { recordId: string; sourcePhotoId: string; mediaId: string; photoId: string; imageSource: string; thumbnailSource: string; uploadedAt: string };
const ITEM_PHOTO = ['SAME_ITEM', 'ITEM_SPECIFICATION', 'ITEM_PACKAGING'];
const ref = (v: unknown): v is string => typeof v === 'string' && /^(?:review|source|consent):[A-Za-z0-9._/-]{4,180}$/.test(v);
const signature = (r: PhotoUploadReceipt, key: string) => createHmac('sha256', key).update(JSON.stringify([r.recordId, r.sourcePhotoId, r.mediaId, r.photoId, r.imageSource, r.thumbnailSource, r.uploadedAt])).digest('hex');
export const signPhotoReceipt = (r: PhotoUploadReceipt, key: string) => ({ ...r, signature: signature(r, key) });
export function verifyPhotoReceipt(v: any, recordId: string, key: string): PhotoUploadReceipt {
  const keys = ['recordId', 'sourcePhotoId', 'mediaId', 'photoId', 'imageSource', 'thumbnailSource', 'uploadedAt', 'signature'];
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => typeof v[k] !== 'string')) throw new LeadError('PHOTO_RECEIPT_INVALID');
  const { signature: given, ...r } = v as PhotoUploadReceipt & { signature: string }, want = signature(r, key);
  if (!/^[a-f0-9]{64}$/.test(given) || !timingSafeEqual(Buffer.from(given), Buffer.from(want)) || r.recordId !== recordId) throw new LeadError('PHOTO_RECEIPT_INVALID');
  try { validatedFlickrSource(r.imageSource, r.photoId); validatedFlickrSource(r.thumbnailSource, r.photoId); } catch { throw new LeadError('PHOTO_RECEIPT_INVALID'); }
  return r;
}
export function recordPhotoEvidence(row: { id: string; archiveItemId: string; canonicalUrl: string; title: string; evidence: unknown }, input: any, receipts: PhotoUploadReceipt[], now = Date.now()) {
  const keys = ['checkedAt', 'sourceRevision', 'reviewRef', 'rightsEvidenceRef', 'coverage', 'photos', 'ambiguities'];
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !keys.includes(k)) || !ref(input.rightsEvidenceRef)) throw new LeadError('PHOTO_ASSIGNMENT_INVALID');
  const { rightsEvidenceRef, ...rest } = input, inventory = { archiveItemId: row.archiveItemId, sourceUrl: row.canonicalUrl, ...rest };
  try { parsePhotoInventory({ ...inventory, bindingHash: '0'.repeat(64) }, row, now); } catch { throw new LeadError('PHOTO_ASSIGNMENT_INVALID'); }
  const expected = inventory.photos.filter((p: any) => ITEM_PHOTO.includes(p.classification));
  if (expected.some((p: any) => p.archiveItemId !== row.archiveItemId)) throw new LeadError('PHOTO_ASSIGNMENT_INVALID');
  // A post with more item photos than SOURCE_PHOTO_LIMIT binds its first SOURCE_PHOTO_LIMIT (Hank 2026-10-24); the rest stay listed in the inventory.
  const kept = expected.slice(0, SOURCE_PHOTO_LIMIT);
  const old = new Map<string, any>((Array.isArray((row.evidence as any)?.media) ? (row.evidence as any).media : []).map((m: any) => [m.sourcePhotoId, m]));
  const fresh = new Map(receipts.map(r => [r.sourcePhotoId, r]));
  if (fresh.size !== receipts.length || receipts.some(r => !kept.some((p: any) => p.sourcePhotoId === r.sourcePhotoId) || !isListingId(r.mediaId))) throw new LeadError('PHOTO_RECEIPT_UNUSED');
  const alt = row.title.replace(/^來源線索：/, '').slice(0, 100);
  // A re-check keeps already uploaded photos; only new source photos need a fresh upload receipt.
  const media = kept.map((p: any, sequence: number) => {
    const r = fresh.get(p.sourcePhotoId), m = old.get(p.sourcePhotoId);
    if (!r && !m) throw new LeadError('PHOTO_RECEIPT_REQUIRED');
    const upload = r ? { id: r.mediaId, flickrPhotoId: r.photoId, imageUrl: r.imageSource, thumbnailUrl: r.thumbnailSource, uploadReceiptRef: 'source:flickr-upload/' + r.mediaId } :
      { id: m.id, flickrPhotoId: m.flickrPhotoId, imageUrl: m.imageUrl, thumbnailUrl: m.thumbnailUrl, uploadReceiptRef: m.uploadReceiptRef };
    return { ...upload, archiveItemId: row.archiveItemId, sourceUrl: row.canonicalUrl, sourcePhotoId: p.sourcePhotoId, permission: 'PUBLIC_DISPLAY_AND_STORAGE', rightsBasis: 'HANK_USER_DIRECTED', reviewed: true, storageProvider: 'FLICKR',
      rightsEvidenceRef, mappingEvidenceRef: inventory.reviewRef, sequence, alt, checkedAt: inventory.checkedAt, permissionExpiresAt: new Date(Date.parse(inventory.checkedAt) + SOURCE_VALIDITY_MS).toISOString() };
  });
  const photoInventory = { ...inventory, bindingHash: photoBindingHash(inventory, media) };
  const probe = { archiveItemId: row.archiveItemId, canonicalUrl: row.canonicalUrl, recordOrigin: 'DB_MASTER', evidence: { media, photoInventory } };
  if (!['IMPORTED_COMPLETE', 'OVER_LIMIT'].includes(photoCompleteness(probe, sourceLeadMedia(probe, now), now).status)) throw new LeadError('PHOTO_IMPORT_NOT_COMPLETE');
  return { media, photoInventory };
}
