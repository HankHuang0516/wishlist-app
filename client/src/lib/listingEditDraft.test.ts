import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseListingEditDraft, serializeListingEditDraft } from './listingEditDraft';
const id = '11111111-1111-4111-8111-111111111111', base = { title: '原商品', description: '說明', price: '200' };
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe('unsent owner edits', () => {
  it('preserves incomplete text for recovery without mistaking it for a valid submitted edit', () => {
    const fields = { title: '', description: '尚未寫完\n🦉', price: '1.' };
    const raw = serializeListingEditDraft(id, 3, base, fields), draft = parseListingEditDraft(raw, id);
    expect(draft.fields).toEqual(fields); expect(draft.baseFields).toEqual(base); expect(draft.baseVersion).toBe(3);
    expect(JSON.parse(serializeListingEditDraft(id, 3, base, fields)).revision).not.toBe(draft.revision);
  });
  it.each(['listingId', 'baseVersion', 'fields', 'revision', 'version', 'extra'])('rejects corrupt, mismatched or unknown private draft data %s', key => {
    const row = JSON.parse(serializeListingEditDraft(id, 1, base, base));
    row[key] = key === 'baseVersion' ? 0 : key === 'fields' ? { ...base, token: 'forbidden' } : 'invalid';
    expect(() => parseListingEditDraft(JSON.stringify(row), id)).toThrow();
  });
  it('rejects a different listing and oversized input', () => {
    const raw = serializeListingEditDraft(id, 1, base, base);
    expect(() => parseListingEditDraft(raw, '22222222-2222-4222-8222-222222222222')).toThrow();
    expect(() => serializeListingEditDraft(id, 1, base, { ...base, description: 'x'.repeat(3001) })).toThrow();
  });
});
