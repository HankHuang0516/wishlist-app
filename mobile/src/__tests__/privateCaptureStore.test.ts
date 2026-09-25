import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ files: new Map<string, number>(), directories: new Set<string>(), failCopy: false }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algorithm: string, value: string) => value.includes('other.example') ? 'other-host' : 'main-host',
}));
vi.mock('expo-file-system', () => {
  const uri = (...parts: (string | { uri: string })[]) => {
    const [first, ...rest] = parts.map(part => typeof part === 'string' ? part : part.uri);
    return first.replace(/\/$/, '') + rest.map(part => `/${part.replace(/^\/+|\/+$/g, '')}`).join('');
  };
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(...parts); }
    get exists() { return state.directories.has(this.uri); }
    create() { state.directories.add(this.uri); }
    list() { return [...state.files.keys()].filter(path => path.startsWith(`${this.uri}/`) && !path.slice(this.uri.length + 1).includes('/'))
      .map(path => new File(path)); }
    delete() { for (const path of state.files.keys()) if (path.startsWith(`${this.uri}/`)) state.files.delete(path); state.directories.delete(this.uri); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = uri(...parts); }
    get name() { return this.uri.split('/').at(-1)!; }
    get exists() { return state.files.has(this.uri); }
    info() { return { exists: this.exists, size: state.files.get(this.uri) ?? 0, creationTime: 1 }; }
    async copy(destination: File) { if (state.failCopy) { state.files.set(destination.uri, 0); throw new Error('copy failed'); }
      state.files.set(destination.uri, state.files.get(this.uri) ?? 0); }
    async move(destination: File) { state.files.set(destination.uri, state.files.get(this.uri) ?? 0); state.files.delete(this.uri); }
    delete() { state.files.delete(this.uri); }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' } } };
});

import { erasePrivateCaptures, listPrivateCaptures, preservePrivateCapture, releasePrivateCapture } from '../privateCaptureStore';

const api = 'https://example.com/api';
const id = '9a318c01-0844-4d79-b8c0-b544482a6f96';
const otherId = '564d1185-9129-4a47-97af-bf3ad3210a66';

describe('durable private capture recovery', () => {
  beforeEach(() => { state.files.clear(); state.directories.clear(); state.failCopy = false; (globalThis as any).__DEV__ = false;
    state.files.set('file:///cache/source.jpg', 12345); });

  it('recovers a complete capture after a process restart and scopes it to its account', async () => {
    const saved = await preservePrivateCapture(api, 1, id, 'file:///cache/source.jpg');
    expect(saved).toContain(`${id}.jpg`);
    expect(await listPrivateCaptures(api, 1)).toEqual([{ clientUploadId: id, uri: saved }]);
    expect(await listPrivateCaptures(api, 2)).toEqual([]);
    expect(await listPrivateCaptures('https://other.example/api', 1)).toEqual([]);
    await releasePrivateCapture(api, 1, id);
    expect(await listPrivateCaptures(api, 1)).toEqual([]);
  });

  it('does not offer or retain an incomplete copy', async () => {
    state.failCopy = true;
    await expect(preservePrivateCapture(api, 1, id, 'file:///cache/source.jpg')).rejects.toThrow('copy failed');
    expect(await listPrivateCaptures(api, 1)).toEqual([]);
    expect([...state.files.keys()].some(path => path.endsWith('.partial'))).toBe(false);
  });

  it('surfaces a damaged committed photo instead of silently hiding it', async () => {
    const saved = await preservePrivateCapture(api, 1, id, 'file:///cache/source.jpg');
    state.files.set(saved, 0);
    await expect(listPrivateCaptures(api, 1)).rejects.toThrow('Private capture is incomplete');
  });

  it('erases only the authoritative deleted account, never another user', async () => {
    await preservePrivateCapture(api, 1, id, 'file:///cache/source.jpg');
    await preservePrivateCapture(api, 2, otherId, 'file:///cache/source.jpg');
    await erasePrivateCaptures(api, 1);
    expect(await listPrivateCaptures(api, 1)).toEqual([]);
    expect(await listPrivateCaptures(api, 2)).toHaveLength(1);
  });
});
