import { describe, expect, it, vi } from 'vitest';
import { loadPrivateMediaPages } from './listingUploadJournal';

describe('private media pagination', () => {
  it('collects every private page and rejects repeated media IDs', async () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    const page = vi.fn(async (cursor: string | null) => cursor
      ? { items: rows.slice(30), nextCursor: null }
      : { items: rows.slice(0, 30), nextCursor: rows[29].id });
    expect(await loadPrivateMediaPages(page)).toEqual(rows);
    expect(page).toHaveBeenNthCalledWith(2, rows[29].id);
    await expect(loadPrivateMediaPages(async () => ({ items: [rows[0], rows[0]], nextCursor: null }))).rejects.toThrow();
  });
  it('refuses forged cursors, oversized pages and invalid rows', async () => {
    await expect(loadPrivateMediaPages(async () => ({ items: [], nextCursor: 'bad' }))).rejects.toThrow();
    await expect(loadPrivateMediaPages(async () => ({ items: [{ id: 'bad' }], nextCursor: null }))).rejects.toThrow();
    await expect(loadPrivateMediaPages(async () => ({ items: Array(31).fill({ id: '11111111-1111-4111-8111-111111111111' }) }))).rejects.toThrow();
  });
});
