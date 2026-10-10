import { api, ApiFailure } from './marketplaceApi';
import { isUuid } from './listingBatch';
import { parseManagedList, parseManagementPage, validWishId, wishEditBody, WishManagementError, type ManagedList, type ManagedWish } from './wishManagement';
import { listDraftBody, parseWebManagedWish, wishRoot } from './wishWeb';

/** This legacy write has no server operation ID or historical receipt.
 * Preserve the original fields locally; reads never replay or prove the write. */
export type WishUpdateOperation = { version: 1; localOperationId: string; kind: 'LIST' | 'ITEM'; listId: number; itemId: number | null; title: string; method: 'PUT' | 'DELETE'; body: Record<string, unknown> | null };
export type WishUpdateView = { list: ManagedList | null; item: ManagedWish | null; unavailable: boolean };
const sameFields = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(a).sort().join(',') === Object.keys(b).sort().join(',') && Object.entries(a).every(([key,value]) => value === b[key]);
export function parseWishUpdateOperation(raw: string): WishUpdateOperation {
  try {
    const row = JSON.parse(raw) as WishUpdateOperation;
    if (!row || Array.isArray(row) || raw.length > 8000 || new TextDecoder().decode(new TextEncoder().encode(raw)) !== raw ||
        Object.keys(row).sort().join(',') !== 'body,itemId,kind,listId,localOperationId,method,title,version' || row.version !== 1 || !isUuid(row.localOperationId) || !validWishId(row.listId) ||
        !['LIST','ITEM'].includes(row.kind) || (row.kind === 'LIST' ? row.itemId !== null : !validWishId(row.itemId)) || !['PUT','DELETE'].includes(row.method) ||
        typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200 || row.title.includes('\u0000')) throw new Error();
    if (row.method === 'DELETE') { if (row.body !== null) throw new Error(); return row; }
    const body = row.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    if (row.kind === 'LIST') {
      if (typeof body.title !== 'string' || !(body.description === null || typeof body.description === 'string') || typeof body.isPublic !== 'boolean' ||
          !sameFields(body, listDraftBody(body.title, body.description ?? '', body.isPublic))) throw new Error();
    } else if (Object.keys(body).length === 1 && (typeof body.isHidden === 'boolean' || typeof body.isPurchased === 'boolean')) {
      if (!['isHidden','isPurchased'].includes(Object.keys(body)[0])) throw new Error();
    } else {
      if (typeof body.name !== 'string' || !(body.notes === null || typeof body.notes === 'string') || !(body.link === null || typeof body.link === 'string') ||
          !(body.maxPrice === null || typeof body.maxPrice === 'number') || !(body.priceCurrency === undefined || typeof body.priceCurrency === 'string') ||
          !sameFields(body, wishEditBody({ name: body.name, notes: body.notes ?? '', link: body.link ?? '', budget: body.maxPrice === null ? '' : String(body.maxPrice), currency: String(body.priceCurrency ?? 'TWD') }))) throw new Error();
    }
    return row;
  } catch { throw new WishManagementError('無法安全恢復原願望更新；原紀錄保留，不會送出新更新。'); }
}
export function confirmWishUpdate(value: unknown, operation: WishUpdateOperation) {
  if (operation.method === 'DELETE') {
    const row = value as Record<string, unknown>;
    if (!row || row.id !== (operation.itemId ?? operation.listId) || row.deleted !== true) throw new WishManagementError();
    return;
  }
  const result = operation.kind === 'LIST' ? parseManagedList(value) : parseWebManagedWish(value);
  if (result.id !== (operation.itemId ?? operation.listId) || operation.kind === 'ITEM' && (result as ManagedWish).wishlistId !== operation.listId) throw new WishManagementError();
  const fields = result as unknown as Record<string, unknown>;
  if (Object.entries(operation.body!).some(([key,expected]) => fields[key] !== expected)) throw new WishManagementError('回覆與送出的願望欄位不一致，尚未確認更新');
}
export async function readWishUpdate(token: string, operation: WishUpdateOperation): Promise<WishUpdateView> {
  let cursor: number | null = null;
  for (let pages = 0; pages < 201; pages++) {
    let value: { list: unknown; items: unknown[]; nextCursor: unknown };
    try { value = await api(token, `${wishRoot}/lists/${operation.listId}` + (cursor ? '?cursor=' + cursor : '')); }
    catch (failure) { if (failure instanceof ApiFailure && failure.status === 404) return { list: null, item: null, unavailable: true }; throw failure; }
    const list = parseManagedList(value.list), page = parseManagementPage(value, item => parseWebManagedWish(item), 50);
    if (list.id !== operation.listId || page.items.some((item,index) => item.wishlistId !== operation.listId || cursor !== null && item.id <= cursor || index > 0 && item.id <= page.items[index-1].id)) throw new WishManagementError();
    if (operation.kind === 'LIST') return { list, item: null, unavailable: false };
    const item = page.items.find(row => row.id === operation.itemId);
    if (item) return { list, item, unavailable: false };
    if (page.nextCursor === null || page.items.some(row => row.id > operation.itemId!)) return { list, item: null, unavailable: true };
    if (cursor !== null && page.nextCursor <= cursor) throw new WishManagementError();
    cursor = page.nextCursor;
  }
  throw new WishManagementError();
}
