import { isUuid } from './listingBatch';
import type { ManagedListing } from './managedListingWeb';

export type ListingEditFields = { title: string; description: string; price: string };
export type ListingEditDraft = { version: 1; revision: string; listingId: string; baseVersion: number; baseFields: ListingEditFields; fields: ListingEditFields };
export function listingFields(item: Pick<ManagedListing, 'title' | 'description' | 'price'>): ListingEditFields {
  return { title: item.title, description: item.description ?? '', price: item.price === null ? '' : String(item.price) };
}
export function sameEditFields(a: ListingEditFields, b: ListingEditFields) {
  return a.title === b.title && a.description === b.description && a.price === b.price;
}
function fields(value: unknown): ListingEditFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('商品編輯草稿不正確');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'description,price,title' || typeof row.title !== 'string' || row.title.length > 100 ||
    typeof row.description !== 'string' || row.description.length > 3000 || typeof row.price !== 'string' || row.price.length > 128) throw new Error('商品編輯草稿不正確');
  return row as ListingEditFields;
}
export function parseListingEditDraft(raw: string, listingId: string): ListingEditDraft {
  const row = JSON.parse(raw);
  if (!row || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'baseFields,baseVersion,fields,listingId,revision,version' ||
    row.version !== 1 || !isUuid(row.revision) || !isUuid(row.listingId) || row.listingId !== listingId ||
    !Number.isSafeInteger(row.baseVersion) || row.baseVersion < 1) throw new Error('商品編輯草稿不正確');
  fields(row.baseFields); fields(row.fields);
  return row;
}
export function serializeListingEditDraft(listingId: string, baseVersion: number, baseFields: ListingEditFields, value: ListingEditFields): string {
  const raw = JSON.stringify({ version: 1, revision: crypto.randomUUID(), listingId, baseVersion, baseFields, fields: value });
  parseListingEditDraft(raw, listingId); return raw;
}
