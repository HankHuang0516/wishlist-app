import { describe, expect, it, vi } from 'vitest';
import { encodeProductNotice, hasProductNoticeAck, PRODUCT_NOTICE_KEY, rememberProductNotice } from '../productNotice';

const origin = 'https://example.com';
describe('explicit one-time rebrand notice acknowledgement', () => {
  it('only stores non-account metadata in a separate key', () => {
    expect(PRODUCT_NOTICE_KEY).not.toContain('session');
    expect(JSON.parse(encodeProductNotice(origin))).toEqual({ version: 1, revision: 'weesh-to-wishlist-2026-09', apiBase: origin });
    expect(hasProductNoticeAck(encodeProductNotice(origin + '/api/'), origin)).toBe(true);
  });
  it.each([null, '', 'not-json', '[]', 'null', '{}', 'true', 'a'.repeat(2049)])('shows the notice without a valid stored acknowledgement %#', saved => {
    expect(hasProductNoticeAck(saved, origin)).toBe(false);
  });
  it('never inherits acknowledgement from a different service or product revision', () => {
    const ack = JSON.parse(encodeProductNotice(origin));
    for (const patch of [{ apiBase: 'https://other.example.com' }, { revision: 'old' }, { version: 2 }, { token: 'not-allowed' }]) {
      expect(hasProductNoticeAck(JSON.stringify({ ...ack, ...patch }), origin)).toBe(false);
    }
  });
  it('only permits HTTP for explicitly enabled development loopback', () => {
    const value = encodeProductNotice('http://localhost:3000', true);
    expect(hasProductNoticeAck(value, 'http://localhost:3000', true)).toBe(true);
    expect(hasProductNoticeAck(value, 'http://localhost:3000')).toBe(false);
    expect(() => encodeProductNotice('http://example.com', true)).toThrow();
  });
  it('reports remembered only after the secure storage promise succeeds', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    expect(await rememberProductNotice(origin, save)).toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith(encodeProductNotice(origin));
  });
  it('does not claim persistence or fall back to plaintext when saving fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('private-storage-error'));
    expect(await rememberProductNotice(origin, save)).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('rejects credential-bearing service URLs before attempting to persist', async () => {
    const save = vi.fn();
    expect(await rememberProductNotice('https://user:password@example.com', save)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
