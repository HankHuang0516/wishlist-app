import { validatedFlickrSource } from './listingFlickrStorage';
import { getApiUrl } from '../config/constants';
import { isListingId } from './listingRules';
import { privateContactField, forbiddenListingField } from './listingPolicy';
// Reuse existing Flickr storage only after item-specific permission and upload receipts.
export type LeadMediaMapping = { id: string; sourceUrl: string; imageUrl: string; thumbnailUrl: string; alt: string; flickrPhotoId: string; sequence: number };
const ref = (v: unknown): v is string => typeof v === 'string' && /^(?:review|source|consent):[A-Za-z0-9._/-]{4,180}$/.test(v);
export function sourceLeadMedia(row: { archiveItemId: string; canonicalUrl: string; evidence: unknown }, now = Date.now()): LeadMediaMapping[] {
 const evidence = row.evidence as { media?: unknown } | null;
 if (!Array.isArray(evidence?.media) || evidence.media.length > 8) return [];
 const seen = new Set<string>(), orders = new Set<number>();
 return evidence.media.flatMap((m: any) => {
  if (!m || typeof m !== 'object' || m.archiveItemId !== row.archiveItemId || m.sourceUrl !== row.canonicalUrl || m.permission !== 'PUBLIC_DISPLAY_AND_STORAGE' || (m.rightsBasis !== undefined && !['HANK_USER_DIRECTED','SELLER_CONSENT'].includes(m.rightsBasis)) || m.reviewed !== true || m.storageProvider !== 'FLICKR' || !ref(m.rightsEvidenceRef) || !ref(m.mappingEvidenceRef) || !ref(m.uploadReceiptRef) || !isListingId(m.id) || seen.has(m.id) || !Number.isSafeInteger(m.sequence) || m.sequence < 0 || m.sequence > 7 || orders.has(m.sequence) || typeof m.alt !== 'string' || !m.alt.trim() || m.alt.length > 100 || privateContactField({title:m.alt}) || forbiddenListingField({title:m.alt}) || /[\u0000-\u001f\u007f]/.test(m.alt) || !Number.isFinite(Date.parse(m.checkedAt)) || Date.parse(m.checkedAt) > now || now - Date.parse(m.checkedAt) > 48 * 3600000 || !Number.isFinite(Date.parse(m.permissionExpiresAt)) || Date.parse(m.permissionExpiresAt) <= now) return [];
  try { validatedFlickrSource(m.imageUrl, m.flickrPhotoId); validatedFlickrSource(m.thumbnailUrl, m.flickrPhotoId); } catch { return []; }
  seen.add(m.id); orders.add(m.sequence); return [{ id: m.id, sourceUrl: m.sourceUrl, imageUrl: m.imageUrl, thumbnailUrl: m.thumbnailUrl, alt: m.alt, flickrPhotoId: m.flickrPhotoId, sequence: m.sequence }];
 }).sort((a,b) => a.sequence - b.sequence);
}
export function sourceLeadMediaDTO(row: { id: string; archiveItemId: string; canonicalUrl: string; evidence: unknown }) {
 return sourceLeadMedia(row).map(({id,sourceUrl,alt}) => { const base = `${getApiUrl().replace(/\/$/, '')}/source-leads/${row.id}/media/${id}`; return {id,sourceUrl,alt,imageUrl:base+'/image',thumbnailUrl:base+'/thumbnail'}; });
}
