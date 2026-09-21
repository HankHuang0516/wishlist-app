import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPrivatePendingIndex } from '../privatePendingIndex';
import { createPendingStore } from '../pendingStore';
const scope = `wishlist.pending.v1.${'a'.repeat(64)}.42`;
const otherScope = `wishlist.pending.v1.${'a'.repeat(64)}.43`;
const indexBase = scope.replace('wishlist.pending.v1.', 'wishlist.private-index.v1.');
const key = `${scope}.listing`;
function fixture() {
  const values = new Map<string, string>();
  const port = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    remove: vi.fn(async (key: string) => { values.delete(key); }),
  };
  const index = createPrivatePendingIndex(port);
  return { values, port, index, pending: createPendingStore(index.privateStore, randomUUID) };
}
describe('owner-bound encrypted pending-key cleanup index', () => {
  it('writes the exact cleanup hint before any private payload', async () => {
    const { values, port, index } = fixture();
    await index.privateStore.set(key, 'private body');
    expect(port.set.mock.calls.map(call => call[0])).toEqual([`${indexBase}.0`, key]);
    expect(JSON.parse(values.get(`${indexBase}.0`)!)).toEqual({ v: 1, keys: [key] });
    expect(values.get(`${indexBase}.0`)).not.toContain('private body');
  });
  it('registers readable legacy payloads before returning them', async () => {
    const { values, index } = fixture(); values.set(key, 'legacy');
    expect(await index.privateStore.get(key)).toBe('legacy');
    expect(JSON.parse(values.get(`${indexBase}.0`)!)).toEqual({ v: 1, keys: [key] });
  });
  it('keeps uncommitted orphan generations enumerable after an app restart', async () => {
    const { values, port, pending } = fixture();
    port.set.mockImplementation(async (name, value) => {
      values.set(name, value); if (name === key) throw new Error('manifest reply lost');
    });
    let lost = false;
    port.get.mockImplementation(async name => {
      if (name === key && values.has(name)) { lost = true; throw new Error('lookup unavailable'); }
      return values.get(name) ?? null;
    });
    await expect(pending.save(key, 'private'.repeat(300))).rejects.toThrow(); expect(lost).toBe(true);
    port.get.mockImplementation(async name => values.get(name) ?? null);
    port.set.mockImplementation(async (name, value) => { values.set(name, value); });
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 0 });
    expect([...values.keys()].filter(name => name.startsWith(scope))).toEqual([]);
  });
  it('tracks chunks even after the commit marker was cleared and cleanup failed', async () => {
    const { values, port, pending } = fixture(); await pending.save(key, 'private');
    port.remove.mockImplementation(async name => { if (name === key) values.delete(name); else throw new Error('chunk unavailable'); });
    expect(await pending.clear(key)).toBe(true);
    expect([...values.keys()].filter(name => name.startsWith(scope))).toHaveLength(1);
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 1 });
    port.remove.mockImplementation(async name => { values.delete(name); });
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 0 });
  });
  it('cleans only this account and preserves another owner and service', async () => {
    const { values, pending, index } = fixture();
    const remote = `wishlist.pending.v1.${'b'.repeat(64)}.42.wish-create`;
    await pending.save(key, 'owner'); await pending.save(`${otherScope}.listing`, 'other'); await pending.save(remote, 'remote');
    values.set('wishlist.session.v2', 'not managed by this index');
    expect(await index.erase(scope)).toEqual({ remaining: 0 });
    expect(await pending.get(`${otherScope}.listing`)).toBe('other'); expect(await pending.get(remote)).toBe('remote');
    expect(values.get('wishlist.session.v2')).toBe('not managed by this index');
  });
  it('fences later writes and reads durably, including a new JS instance', async () => {
    const { values, port, index } = fixture(); await index.privateStore.set(key, 'body'); await index.erase(scope);
    const restarted = createPrivatePendingIndex(port);
    await expect(restarted.privateStore.set(key, 'late body')).rejects.toThrow();
    expect(await restarted.privateStore.get(key)).toBeNull(); expect(values.has(key)).toBe(false);
    expect(values.get(`${indexBase}.retired`)).toBe('1');
  });
  it('serializes an already queued writer before erasure and rejects the next writer', async () => {
    const { values, index } = fixture();
    const results = await Promise.allSettled([index.privateStore.set(key, 'earlier'), index.erase(scope), index.privateStore.set(key, 'later')]);
    expect(results.map(value => value.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']); expect(values.has(key)).toBe(false);
  });
  it('does not write payloads if index persistence fails before its commit', async () => {
    const { values, port, index } = fixture(); port.set.mockRejectedValueOnce(new Error('index unavailable'));
    await expect(index.privateStore.set(key, 'body')).rejects.toThrow(); expect(values.has(key)).toBe(false);
  });
  it('rereads ambiguous index persistence rather than losing an orphan hint', async () => {
    const { values, port, index } = fixture();
    port.set.mockImplementationOnce(async (name, value) => { values.set(name, value); throw new Error('ambiguous index'); });
    await expect(index.privateStore.set(key, 'body')).rejects.toThrow(); expect(values.has(key)).toBe(false);
    await index.privateStore.set(key, 'retry');
    expect(JSON.parse(values.get(`${indexBase}.0`)!)).toEqual({ v: 1, keys: [key] });
  });
  it('retains hints when private deletion fails and retries after restarting', async () => {
    const { values, port, index } = fixture(); await index.privateStore.set(key, 'body');
    port.remove.mockRejectedValueOnce(new Error('delete unavailable'));
    expect(await index.erase(scope)).toEqual({ remaining: 1 }); expect(values.get(key)).toBe('body');
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 0 }); expect(values.has(key)).toBe(false);
  });
  it('retains hints after ambiguous payload deletion or index-unregister failures', async () => {
    const { values, port, index } = fixture(); await index.privateStore.set(key, 'body');
    port.set.mockImplementation(async (name, value) => {
      if (name === `${indexBase}.0`) throw new Error('unregister unavailable'); values.set(name, value);
    });
    expect(await index.erase(scope)).toEqual({ remaining: 1 }); expect(values.has(key)).toBe(false);
    port.set.mockImplementation(async (name, value) => { values.set(name, value); });
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 0 });
  });
  it('stops erasure if its durable late-write fence cannot be saved', async () => {
    const { values, port, index } = fixture(); await index.privateStore.set(key, 'body');
    port.set.mockRejectedValueOnce(new Error('retirement unavailable'));
    await expect(index.erase(scope)).rejects.toThrow(); expect(values.get(key)).toBe('body');
  });
  it('does not overwrite a damaged retirement marker or touch private payloads', async () => {
    const { values, index } = fixture(); values.set(`${indexBase}.retired`, 'invalid'); values.set(key, 'body');
    await expect(index.privateStore.get(key)).rejects.toThrow(); await expect(index.erase(scope)).rejects.toThrow();
    expect(values.get(`${indexBase}.retired`)).toBe('invalid'); expect(values.get(key)).toBe('body');
  });
  it('does not return private values if the existing index cannot be loaded', async () => {
    const { values, port, index } = fixture(); values.set(key, 'body'); port.get.mockRejectedValueOnce(new Error('index lookup unavailable'));
    await expect(index.privateStore.get(key)).rejects.toThrow(); expect(values.get(key)).toBe('body');
  });
  it.each(['bad-json', '{}', '{"v":2,"keys":[]}', '{"v":1,"keys":["unrelated"]}', JSON.stringify({ v: 1, keys: [`${otherScope}.listing`] }), JSON.stringify({ v: 1, keys: [key, key] }), JSON.stringify({ v: 1, keys: [], secret: 'unexpected' })])('fails closed for corrupt or foreign scope index %s', async encoded => {
    const { values, index } = fixture(); values.set(`${indexBase}.0`, encoded); values.set(key, 'body');
    await expect(index.privateStore.get(key)).rejects.toThrow(); await expect(index.erase(scope)).rejects.toThrow(); expect(values.get(key)).toBe('body');
  });
  it('rejects duplicate keys across different pages before reading or deleting private data', async () => {
    const { values, index } = fixture(); values.set(`${indexBase}.0`, JSON.stringify({ v: 1, keys: [key] })); values.set(`${indexBase}.1`, JSON.stringify({ v: 1, keys: [key] })); values.set(key, 'body');
    await expect(index.erase(scope)).rejects.toThrow(); expect(values.get(key)).toBe('body');
  });
  it.each(['unrelated', '../key', `${scope}.listing.bad`, `${scope}.message.invalid`, `${scope}.listing.${randomUUID()}.41`, `wishlist.pending.v1.${'a'.repeat(64)}.2147483648.listing`, `${scope}.LISTING`])('rejects an invalid key before any native storage call %s', async name => {
    const { port, index } = fixture(); await expect(index.privateStore.set(name, 'body')).rejects.toThrow(); expect(port.get).not.toHaveBeenCalled(); expect(port.set).not.toHaveBeenCalled();
  });
  it('keeps the maximum 1024 hints in bounded records and refuses untracked overflow writes', async () => {
    const { values, port, index } = fixture();
    for (let i = 0; i < 1024; i++) await index.privateStore.set(`${scope}.message.${randomUUID()}`, 'body');
    const extra = `${scope}.message.${randomUUID()}`;
    await expect(index.privateStore.set(extra, 'overflow')).rejects.toThrow(); expect(values.has(extra)).toBe(false);
    const metadata = port.set.mock.calls.filter(call => call[0].startsWith(indexBase));
    expect(metadata.every(call => new TextEncoder().encode(call[1]).length <= 1900)).toBe(true);
    expect(await createPrivatePendingIndex(port).erase(scope)).toEqual({ remaining: 0 });
  });
});
