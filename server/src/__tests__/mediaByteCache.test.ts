import { ByteCache } from '../lib/mediaByteCache';

describe('bounded byte cache', () => {
    const bytes = (n: number, fill = 1) => Buffer.alloc(n, fill);
    it('evicts the least recently read entry when the total would exceed the budget', () => {
        const cache = new ByteCache(100, 60_000);
        cache.set('a', bytes(40)); cache.set('b', bytes(40));
        expect(cache.get('a')).toBeDefined();           // a is now the most recently read
        cache.set('c', bytes(40));                     // 120 > 100: b goes, not a
        expect(cache.has('b')).toBe(false); expect(cache.has('a')).toBe(true); expect(cache.has('c')).toBe(true);
        expect(cache.stats()).toEqual({ entries: 2, bytes: 80, maxBytes: 100 });
    });
    it('refuses an entry larger than the whole budget and replaces an entry under the same key', () => {
        const cache = new ByteCache(100, 60_000);
        cache.set('big', bytes(101)); expect(cache.has('big')).toBe(false);
        cache.set('k', bytes(60)); cache.set('k', bytes(30, 2));
        expect(cache.get('k')!.length).toBe(30); expect(cache.stats().bytes).toBe(30);
    });
    it('forgets an entry after its time to live', () => {
        let now = 1000; const cache = new ByteCache(100, 500, () => now);
        cache.set('k', bytes(10));
        now = 1400; expect(cache.has('k')).toBe(true);
        now = 1600; expect(cache.has('k')).toBe(false); expect(cache.stats()).toEqual({ entries: 0, bytes: 0, maxBytes: 100 });
        cache.set('k', bytes(10)); cache.clear(); expect(cache.stats().entries).toBe(0);
    });
});
