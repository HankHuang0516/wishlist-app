import { validateApiUrl } from './api';
import { uuid } from './listingForm';
import type { ManagedListing } from './managedListing';

/** The version changes when listing details change and gives link-preview caches a fresh URL. */
export function listingShareUrl(item: Pick<ManagedListing, 'id' | 'publishedAt' | 'version'>, apiUrl: string, local = false): string | null {
  if (!item.publishedAt || !uuid(item.id) || !Number.isSafeInteger(item.version) || item.version < 1) return null;
  const origin = new URL(validateApiUrl(apiUrl, local)).origin;
  return `${origin}/listings/${item.id}?v=${item.version}`;
}

export function listingShareMessage(item: Pick<ManagedListing, 'title' | 'price'>, url: string): string {
  const price = item.price === null ? '價格洽詢' : item.price === 0 ? '免費贈送' :
    `NT$ ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(item.price)}`;
  return `看看「${item.title}」｜${price}：${url}`;
}
