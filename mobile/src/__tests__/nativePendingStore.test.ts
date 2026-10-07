import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('hex'),
  randomUUID: () => randomUUID(),
}));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: async (key: string) => native.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { native.values.set(key, value); },
  deleteItemAsync: async (key: string) => { native.values.delete(key); },
}));

const api = 'https://example.test/api';
const room = 'c373af4c-cfe6-4475-b3f7-0c218efdec45';
const resources = ['listing', 'wish-create', 'listing-report', `message.${room}`, `meetup.${room}`, `chat-report.${room}`];

describe('native pending request keys through the real privacy index and chunk store', () => {
  beforeEach(() => {
    native.values.clear();
    vi.resetModules();
    vi.stubGlobal('__DEV__', false);
  });

  it.each(resources)('can restore, save and clear the generated %s key', async resource => {
    const store = await import('../nativePendingStore');
    const key = await store.pendingRequestKey(api, 42, resource);
    expect(await store.privatePendingStore.get(key)).toBeNull();
    await store.privatePendingStore.save(key, 'pending request');
    expect(await store.privatePendingStore.get(key)).toBe('pending request');
    expect(await store.privatePendingStore.clear(key, 'pending request')).toBe(true);
    expect(await store.privatePendingStore.get(key)).toBeNull();
  });

  it('restores a full-length chat report after restart without changing its request ID', async () => {
    const { chatReportBody } = await import('../chatReport');
    const first = await import('../nativePendingStore');
    const key = await first.pendingRequestKey(api, 42, `chat-report.${room}`);
    const body = JSON.stringify(chatReportBody(randomUUID(), 43, 'OTHER', '測'.repeat(2000), randomUUID()));
    await first.privatePendingStore.save(key, body);
    expect([...native.values.keys()].filter(name => name.startsWith(key + '.')).length).toBeGreaterThan(1);
    vi.resetModules();
    const restarted = await import('../nativePendingStore');
    expect(await restarted.privatePendingStore.get(key)).toBe(body);
    expect(await restarted.privatePendingStore.clear(key, 'different request')).toBe(false);
    expect(await restarted.privatePendingStore.get(key)).toBe(body);
    expect(await restarted.privatePendingStore.clear(key, body)).toBe(true);
    expect([...native.values.keys()].filter(name => name.startsWith(key))).toEqual([]);
  });

  it('erases report chunks for the erased account while preserving the other account', async () => {
    const first = await import('../nativePendingStore');
    const key = await first.pendingRequestKey(api, 42, `chat-report.${room}`);
    const other = await first.pendingRequestKey(api, 43, `chat-report.${room}`);
    await first.privatePendingStore.save(key, 'private report'.repeat(200));
    await first.privatePendingStore.save(other, 'other account report');
    vi.resetModules();
    const restarted = await import('../nativePendingStore');
    expect(await restarted.erasePrivatePendingData(api, 42)).toEqual({ remaining: 0 });
    expect([...native.values.keys()].filter(name => name.startsWith(key))).toEqual([]);
    expect(await restarted.privatePendingStore.get(other)).toBe('other account report');
    expect(await restarted.privatePendingStore.get(key)).toBeNull();
    await expect(restarted.privatePendingStore.save(key, 'late report')).rejects.toThrow();
  });
});
