import { createHash, randomBytes } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

// TEMPORARY (2026-11-05): measures which address the Railway proxy chain gives
// the rate limiters. It logs counts only, never an address or a hash, and the
// salt lives in memory for this process alone. It stops by itself and is removed
// once the measurement is read. It never touches the request or the response.
export const PROXY_DIAG_RUNTIME_MS = 60 * 60 * 1000;
const LOG_EVERY_MS = 60 * 1000;
const MAX_TRACKED = 20_000;
const SENTINEL = /^203\.0\.113\./; // TEST-NET-3: no real client can connect from it.
const NOTABLE_HEADERS = ['cf-connecting-ip', 'fastly-client-ip', 'true-client-ip', 'x-envoy-external-address', 'forwarded', 'x-railway-edge', 'x-railway-request-id'];

const bare = (value: string | undefined) => (value ?? '').trim().replace(/^::ffff:/i, '');

export function addressClass(address: string): string {
  if (!address) return 'none';
  if (address.includes(':')) return address === '::1' ? 'loopback' : /^f[cd]/i.test(address) ? 'v6-private' : 'v6-public';
  const [a, b] = address.split('.').map(Number);
  if (a === 127) return 'loopback';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat-100.64/10';
  if (a === 100) return '100-other';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  return 'public';
}

type Tally = Record<string, number>;
const bump = (tally: Tally, key: string) => { tally[key] = (tally[key] ?? 0) + 1; };

class PairCount {
  private readonly groups = new Map<string, Set<string>>();
  overflowed = false;
  add(group: string, member: string) {
    const known = this.groups.get(group);
    if (known) { if (known.size < MAX_TRACKED) known.add(member); return; }
    if (this.groups.size >= MAX_TRACKED) { this.overflowed = true; return; }
    this.groups.set(group, new Set([member]));
  }
  get distinct() { return this.groups.size; }
  get maxMembers() { let max = 0; for (const members of this.groups.values()) max = Math.max(max, members.size); return max; }
}

export function proxyChainDiagnostics(options: { log?: (line: string) => void; clock?: () => number } = {}): RequestHandler {
  const log = options.log ?? console.log;
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const salt = randomBytes(32);
  const hash = (value: string) => createHash('sha256').update(salt).update(value).digest('base64');

  let requests = 0;
  let lastLogged = startedAt;
  let dirty = false;
  let stopped = false;
  const entries: Tally = {}, peerClass: Tally = {}, rightmostClass: Tally = {}, reqIpClass: Tally = {}, leftmostClass: Tally = {}, realIpClass: Tally = {};
  const agreement: Tally = {}, sentinel: Tally = {}, headers: Tally = {}, edge: Tally = {};
  // For each candidate key: how many values exist, and at worst how many real
  // clients share one value / how many values one real client splits into.
  const clientsPerKey = { reqIp: new PairCount(), leftmost: new PairCount(), secondFromRight: new PairCount(), realIp: new PairCount() };
  const keysPerClient = { reqIp: new PairCount(), leftmost: new PairCount(), secondFromRight: new PairCount(), realIp: new PairCount() };

  const report = () => {
    const shape = (counts: Record<string, PairCount>) => Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { distinct: count.distinct, worst: count.maxMembers, overflowed: count.overflowed }]));
    log('[proxy-chain-diag] ' + JSON.stringify({ requests, uptimeSeconds: Math.round((clock() - startedAt) / 1000), xffEntries: entries, peerClass, rightmostClass, reqIpClass, leftmostClass, realIpClass, agreement, sentinel, headers, edge, clientsPerKey: shape(clientsPerKey), keysPerClient: shape(keysPerClient) }));
  };

  const observe = (req: Request) => {
    const raw = req.headers['x-forwarded-for'];
    const chain = (Array.isArray(raw) ? raw.join(',') : raw ?? '').split(',').map(bare).filter(Boolean);
    const realIp = bare(typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'] : undefined);
    const peer = bare(req.socket.remoteAddress);
    const reqIp = bare(req.ip);
    const leftmost = chain[0] ?? '';
    const rightmost = chain[chain.length - 1] ?? '';
    const secondFromRight = chain.length >= 2 ? chain[chain.length - 2] : chain[0] ?? peer;

    requests++;
    bump(entries, chain.length >= 4 ? '4+' : String(chain.length));
    bump(peerClass, addressClass(peer));
    bump(rightmostClass, addressClass(rightmost));
    bump(reqIpClass, addressClass(reqIp));
    bump(leftmostClass, addressClass(leftmost));
    bump(realIpClass, addressClass(realIp));
    if (reqIp === rightmost) bump(agreement, 'reqIp=rightmost');
    if (reqIp === leftmost) bump(agreement, 'reqIp=leftmost');
    if (reqIp === realIp) bump(agreement, 'reqIp=realIp');
    if (leftmost === realIp) bump(agreement, 'leftmost=realIp');
    if (secondFromRight === realIp) bump(agreement, 'secondFromRight=realIp');
    if (chain.some(address => SENTINEL.test(address))) bump(sentinel, 'inXff');
    if (SENTINEL.test(leftmost)) bump(sentinel, 'xffLeftmost');
    if (SENTINEL.test(realIp)) bump(sentinel, 'realIp');
    if (SENTINEL.test(reqIp)) bump(sentinel, 'reqIp');
    for (const name of NOTABLE_HEADERS) if (req.headers[name] !== undefined) bump(headers, name);
    const edgeName = req.headers['x-railway-edge'];
    if (typeof edgeName === 'string' && /^[a-z0-9/_-]{1,40}$/i.test(edgeName)) bump(edge, edgeName);

    const client = hash(realIp || leftmost || peer);
    const candidates = { reqIp, leftmost, secondFromRight, realIp };
    for (const key of Object.keys(candidates) as (keyof typeof candidates)[]) {
      const value = hash(candidates[key]);
      clientsPerKey[key].add(value, client);
      keysPerClient[key].add(client, value);
    }
    dirty = true;
  };

  return (req, _res, next) => {
    if (stopped) return next();
    try {
      const now = clock();
      if (now - startedAt >= PROXY_DIAG_RUNTIME_MS) {
        stopped = true;
        report();
        log('[proxy-chain-diag] stopped');
        return next();
      }
      observe(req);
      if (dirty && now - lastLogged >= LOG_EVERY_MS) { lastLogged = now; dirty = false; report(); }
    } catch {
      // A measurement must never affect a request.
    }
    next();
  };
}
