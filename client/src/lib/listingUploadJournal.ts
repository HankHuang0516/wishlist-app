import { isUuid } from './listingBatch';

export async function loadPrivateMediaPages(fetchPage: (cursor: string | null) => Promise<unknown>): Promise<unknown[]> {
  const items: unknown[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const raw = await fetchPage(cursor);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('私人照片清單不正確');
    const response = raw as { items?: unknown; nextCursor?: unknown };
    if (!Array.isArray(response.items) || response.items.length > 30) throw new Error('私人照片清單不正確');
    for (const item of response.items) {
      const id = item && typeof item === 'object' && !Array.isArray(item) ? (item as { id?: unknown }).id : null;
      if (!isUuid(id) || seen.has(id)) throw new Error('私人照片清單不正確');
      seen.add(id); items.push(item);
    }
    const next = response.nextCursor ?? null;
    if (next === null) return items;
    if (!isUuid(next) || response.items.length !== 30 || next !== (response.items[29] as { id: string }).id || next === cursor)
      throw new Error('私人照片清單不正確');
    cursor = next;
  }
  throw new Error('私人照片過多，請聯絡客服協助恢復');
}

// Upload recovery now uses listingPhotoUploadWeb and encrypted scoped proof.
// Never auto-import or delete the old unscoped localStorage upload identifiers.
