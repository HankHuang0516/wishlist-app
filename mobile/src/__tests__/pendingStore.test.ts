import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPendingStore, pendingChunks } from '../pendingStore';
function fixture() {
  const values = new Map<string, string>();
  const port = { get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { values.set(key, value); }), remove: vi.fn(async (key: string) => { values.delete(key); }) };
  return { values, port, pending: createPendingStore(port, randomUUID) };
}
describe('durable encrypted pending request journal', () => {
  it('stores bounded chunks with a pointer last and reconstructs after a new JS session', async () => {
    const { values, port, pending } = fixture(); const body = JSON.stringify({ clientMessageId: randomUUID(), text: '商品👋'.repeat(500) });
    await pending.save('account.1.room', body); expect(port.set.mock.calls.at(-1)?.[0]).toBe('account.1.room');
    expect([...values.values()].every(value => new TextEncoder().encode(value).length < 1500)).toBe(true);
    expect(await createPendingStore(port, randomUUID).get('account.1.room')).toBe(body);
  });
  it('never splits Unicode surrogate pairs or silently replaces text', () => {
    const body = 'x'.repeat(399) + '👋'.repeat(10); const chunks = pendingChunks(body); expect(chunks[0]).toHaveLength(399); expect(chunks.join('')).toBe(body);
    expect(chunks.every(chunk => chunk === new TextDecoder().decode(new TextEncoder().encode(chunk)))).toBe(true);
  });
  it.each(['', 'x'.repeat(16001), '\uD800', '\uDC00'])('rejects invalid or oversized pending payloads', body => expect(() => pendingChunks(body)).toThrow());
  it('handles the maximum payload without exceeding manifest count limits', async () => {
    const { pending } = fixture(); const body = 'x'.repeat(16000); await pending.save('key', body); expect(await pending.get('key')).toBe(body);
  });
  it('handles a maximum Unicode payload whose safe boundaries require 41 chunks', async () => {
    const { pending } = fixture(); const body = 'x'.repeat(399) + '👋'.repeat(7800) + 'x'; expect(body).toHaveLength(16000);
    expect(pendingChunks(body)).toHaveLength(41); await pending.save('key', body); expect(await pending.get('key')).toBe(body);
  });
  it('returns no pending data when none was committed', async () => { const { pending } = fixture(); expect(await pending.get('key')).toBeNull(); await pending.clear('key'); });
  it('permits an identical retry but refuses to overwrite a different unconfirmed request', async () => {
    const { pending } = fixture(); await pending.save('key', 'first'); await pending.save('key', 'first'); await expect(pending.save('key', 'different')).rejects.toThrow(); expect(await pending.get('key')).toBe('first');
  });
  it('serializes concurrent saves rather than allowing two HTTP candidates', async () => {
    const { pending } = fixture(); const results = await Promise.allSettled([pending.save('key', 'first'), pending.save('key', 'second')]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']); expect(await pending.get('key')).toBe('first');
  });
  it('does not mark partially written chunks as committed after a storage failure', async () => {
    const { values, pending, port } = fixture(); port.set.mockImplementationOnce(async (key, value) => { values.set(key, value); }).mockRejectedValueOnce(new Error('simulated storage outage'));
    await expect(pending.save('key', 'x'.repeat(1000))).rejects.toThrow(); expect(values.has('key')).toBe(false); expect(await pending.get('key')).toBeNull();
  });
  it('recovers an ambiguous native failure after the commit marker was actually saved', async () => {
    const { values, port, pending } = fixture(); port.set.mockImplementation(async (key, value) => { values.set(key, value); if (key === 'key') throw new Error('ambiguous native reply'); });
    await pending.save('key', 'body'); expect(await pending.get('key')).toBe('body');
  });
  it('preserves possibly committed chunks when pointer lookup itself fails', async () => {
    const { values, port, pending } = fixture(); let after = false;
    port.set.mockImplementation(async (key, value) => { values.set(key, value); if (key === 'key') { after = true; throw new Error('ambiguous commit'); } });
    port.get.mockImplementation(async key => { if (after) throw new Error('lookup failure'); return values.get(key) ?? null; });
    await expect(pending.save('key', 'body')).rejects.toThrow(); expect(values.size).toBe(2);
  });
  it.each(['{}', '{"v":1,"count":1,"generation":"invalid"}', '{"v":1,"count":999,"generation":"9a318c01-0844-4d79-b8c0-b544482a6f96"}', 'bad-json'])('refuses damaged manifests without silently discarding possible requests', async metadata => {
    const { values, pending } = fixture(); values.set('key', metadata); await expect(pending.get('key')).rejects.toThrow(); expect(values.get('key')).toBe(metadata);
  });
  it('fails closed if a committed chunk was lost', async () => {
    const { values, pending } = fixture(); await pending.save('key', 'body'); for (const key of values.keys()) if (key !== 'key') values.delete(key);
    await expect(pending.get('key')).rejects.toThrow(); expect(values.has('key')).toBe(true);
  });
  it('clears only this committed generation and preserves other accounts and rooms', async () => {
    const { values, pending } = fixture(); await pending.save('key', 'one'); await pending.save('other', 'two'); await pending.clear('key');
    expect(await pending.get('key')).toBeNull(); expect(await pending.get('other')).toBe('two'); expect(values.size).toBe(2);
  });
  it('prevents an old acknowledgement from clearing a newer request in the same room', async () => {
    const { pending } = fixture(); await pending.save('key', 'old-body'); expect(await pending.clear('key', 'old-body')).toBe(true);
    await pending.save('key', 'new-body'); expect(await pending.clear('key', 'old-body')).toBe(false); expect(await pending.get('key')).toBe('new-body');
  });
  it('retains the request if removing its commit marker failed', async () => {
    const { pending, port } = fixture(); await pending.save('key', 'body'); port.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(pending.clear('key')).rejects.toThrow(); expect(await pending.get('key')).toBe('body');
  });
  it('does not reintroduce a pointer after noncritical orphan cleanup failure', async () => {
    const { values, pending, port } = fixture(); await pending.save('key', 'body'); port.remove.mockImplementation(async key => { if (key === 'key') values.delete(key); else throw new Error('orphan cleanup unavailable'); });
    await pending.clear('key'); expect(await pending.get('key')).toBeNull(); expect(values.size).toBe(1);
  });
  it('rejects invalid keys and UUID sources before storing data', async () => {
    const { port, pending } = fixture(); await expect(pending.save('../escape', 'body')).rejects.toThrow();
    await expect(createPendingStore(port, () => 'invalid').save('key', 'body')).rejects.toThrow(); expect(port.set).not.toHaveBeenCalled();
  });
});
