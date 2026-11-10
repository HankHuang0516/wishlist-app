/** Bytes kept in memory by key, bounded by their total size, least recently read evicted first, each entry good for
 * `ttlMs`. Used for photo renditions read from Flickr: the same rendition is read by every visitor of a list page,
 * and a rendition never changes once uploaded (a replaced photo gets a new Flickr id and URL). */
export class ByteCache {
    private readonly entries = new Map<string, { bytes: Buffer; at: number }>();
    private total = 0;
    constructor(readonly maxBytes: number, readonly ttlMs: number, private readonly now: () => number = Date.now) {}

    get(key: string): Buffer | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (this.now() - entry.at > this.ttlMs) { this.drop(key); return undefined; }
        // Re-insert so iteration order is least recently read first.
        this.entries.delete(key); this.entries.set(key, entry);
        return entry.bytes;
    }

    has(key: string) { return this.get(key) !== undefined; }

    set(key: string, bytes: Buffer) {
        if (bytes.length > this.maxBytes) return;
        this.drop(key);
        this.entries.set(key, { bytes, at: this.now() }); this.total += bytes.length;
        while (this.total > this.maxBytes) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.drop(oldest);
        }
    }

    clear() { this.entries.clear(); this.total = 0; }

    stats() { return { entries: this.entries.size, bytes: this.total, maxBytes: this.maxBytes }; }

    private drop(key: string) {
        const entry = this.entries.get(key);
        if (!entry) return;
        this.entries.delete(key); this.total -= entry.bytes.length;
    }
}
