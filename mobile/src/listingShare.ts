import { validateApiUrl } from './api';
import { uuid } from './listingForm';
import type { ManagedListing } from './managedListing';
import { productShareLines, productSharePath, withShareUrl, type ShareProductKind } from './shareText';

/** The version changes when listing details change and gives link-preview caches a fresh URL. */
export function listingShareUrl(item: Pick<ManagedListing, 'id' | 'publishedAt' | 'version'>, apiUrl: string, local = false): string | null {
  if (!item.publishedAt || !uuid(item.id) || !Number.isSafeInteger(item.version) || item.version < 1) return null;
  const origin = new URL(validateApiUrl(apiUrl, local)).origin;
  return `${origin}/listings/${item.id}?v=${item.version}`;
}

export function listingShareMessage(item: Pick<ManagedListing, 'title' | 'price'>, url: string): string {
  const price = item.price === null ? '價格洽詢' : item.price === 0 ? '免費贈送' :
    `NT$ ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(item.price)}`;
  return withShareUrl(productShareLines(item.title, price), url);
}

/** The address of any product's own page on the public site: the one a share hands on, readable without an account. */
export function productShareUrl(product: { kind: ShareProductKind; id: string }, apiUrl: string, local = false, version?: number): string | null {
  const path = productSharePath(product.kind, product.id, version);
  return path && new URL(validateApiUrl(apiUrl, local)).origin + path;
}

/** The same words for every kind of product, on the web page and in the app, then the address on its own line. */
export const productShareMessage = (title: string, price: string, url: string) => withShareUrl(productShareLines(title, price), url);
