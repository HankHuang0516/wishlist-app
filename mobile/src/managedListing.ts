import { validateApiUrl } from './api';
import { taiwanDate, uuid } from './listingForm';

export class ManagedListingError extends Error { constructor(message = '我的商品資料不正確，請重新載入。') { super(message); } }
export type ManagedStatus = 'DRAFT' | 'PENDING_CONFIRMATION' | 'ACTIVE' | 'RESERVED' | 'SOLD' | 'REMOVED' | 'EXPIRED';
export type ManagedListing = {
  id: string; ownerUserId: number; version: number; title: string; description: string | null;
  status: ManagedStatus; condition: 'NEW' | 'USED'; category: string | null; price: number | null;
  createdAt: string; expiresAt: string | null; location: { county: string; district: string } | null;
  media: { id: string; thumbnailUrl: string; capturePurpose: string }[];
};
export type ManagementTab = '在售' | '已保留' | '已售出' | '已失效' | '草稿' | '已移除';
export const MANAGEMENT_TABS: readonly ManagementTab[] = ['在售', '已保留', '已售出', '已失效', '草稿', '已移除'];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ManagedListingError();
  return value as Record<string, unknown>;
}
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max;
const optionalText = (value: unknown, max: number) => value === null || typeof value === 'string' && value.length <= max;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Only the signed-in owner's projected fields enter the management UI. */
export function parseManagedListing(value: unknown, userId: number, apiUrl: string, local = false): ManagedListing {
  const row = record(value), owner = record(row.owner);
  if (!uuid(row.id) || !Number.isSafeInteger(userId) || userId < 1 || row.ownerUserId !== userId || owner.id !== userId ||
      !Number.isSafeInteger(row.version) || (row.version as number) < 1 || !text(row.title, 100) ||
      !optionalText(row.description, 3000) || !['DRAFT', 'PENDING_CONFIRMATION', 'ACTIVE', 'RESERVED', 'SOLD', 'REMOVED', 'EXPIRED'].includes(String(row.status)) ||
      !['NEW', 'USED'].includes(String(row.condition)) || !optionalText(row.category, 50) ||
      !date(row.createdAt) || !(row.expiresAt === null || date(row.expiresAt)) || row.currency !== 'TWD' ||
      !Array.isArray(row.media) || row.media.length > 8 || !(row.location === null || typeof row.location === 'object' && !Array.isArray(row.location))) throw new ManagedListingError();
  const price = row.price === null ? null : typeof row.price === 'string' && /^\d{1,10}(?:\.\d{1,2})?$/.test(row.price) ? Number(row.price) : NaN;
  if (price !== null && (!Number.isFinite(price) || price > 9_999_999_999.99)) throw new ManagedListingError();
  const base = validateApiUrl(apiUrl, local);
  const media = row.media.map(value => {
    const image = record(value);
    if (!uuid(image.id) || image.thumbnailUrl !== `${base}/api/listing-media/${image.id}/thumbnail`) throw new ManagedListingError();
    if (image.capturePurpose !== undefined && typeof image.capturePurpose !== 'string') throw new ManagedListingError();
    return { id: image.id as string, thumbnailUrl: image.thumbnailUrl as string,
      capturePurpose: typeof image.capturePurpose === 'string' ? image.capturePurpose : 'LEGACY_UNKNOWN' };
  });
  if (new Set(media.map(item => item.id)).size !== media.length) throw new ManagedListingError();
  const location = row.location === null ? null : record(row.location);
  if (location && (!text(location.county, 30) || !text(location.district, 30))) throw new ManagedListingError();
  return { id: row.id as string, ownerUserId: userId, version: row.version as number, title: row.title as string,
    description: row.description as string | null, status: row.status as ManagedStatus,
    condition: row.condition as ManagedListing['condition'], category: row.category as string | null, price,
    createdAt: row.createdAt as string, expiresAt: row.expiresAt as string | null,
    location: location ? { county: location.county as string, district: location.district as string } : null, media };
}

export function parseManagedListingPage(value: unknown, userId: number, apiUrl: string, local = false) {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > 50 || !(page.nextCursor === null || uuid(page.nextCursor))) throw new ManagedListingError();
  const items = page.items.map(item => parseManagedListing(item, userId, apiUrl, local));
  if (new Set(items.map(item => item.id)).size !== items.length ||
      page.nextCursor !== null && page.nextCursor !== items.at(-1)?.id) throw new ManagedListingError();
  return { items, nextCursor: page.nextCursor as string | null };
}

export function managementTab(item: ManagedListing, now = Date.now()): ManagementTab {
  if (item.status === 'REMOVED') return '已移除';
  if (item.status === 'SOLD') return '已售出';
  if (item.status === 'DRAFT' || item.status === 'PENDING_CONFIRMATION') return '草稿';
  if (item.status === 'EXPIRED' || item.expiresAt && Date.parse(item.expiresAt) <= now) return '已失效';
  return item.status === 'RESERVED' ? '已保留' : '在售';
}

export function earliestExtensionDate(expiresAt: string | null, now = new Date()): string {
  const today = taiwanDate(now);
  if (expiresAt === null) return today;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) throw new ManagedListingError();
  const followingDay = new Date(timestamp + 86_400_000).toISOString().slice(0, 10);
  return followingDay > today ? followingDay : today;
}

export function listingEditBody(item: ManagedListing, title: string, description: string, price: string) {
  const name = title.trim(), details = description.trim(), amount = price.trim();
  if (!name || name.length > 100 || details.length > 3000 ||
      (item.status !== 'DRAFT' && (!details || !amount)) ||
      (item.description !== null && !details) || (item.price !== null && !amount) ||
      (amount && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) > 9_999_999_999.99)))
    throw new ManagedListingError('請確認名稱、3000 字內說明及有效售價；在售商品不可清空說明或價格。');
  return { expectedVersion: item.version, title: name, ...(details ? { description: details } : {}),
    ...(amount ? { price: Number(amount) } : {}) };
}
