import { createHash } from 'crypto';
import { Prisma, type ExternalSourceLead } from '@prisma/client';
import prisma from './prisma';
import { getApiUrl } from '../config/constants';
import { publicListingSelect } from '../controllers/listingController';
import { externalCandidateSelect } from '../routes/externalListingRoutes';
import { EXTERNAL_OBSERVATION_MAX_AGE_MS } from './externalListingIntake';
import { NON_SALE_QA_PREFIX } from './listingRules';
import { privateReviewListingIds } from './privateReviewDemo';
import type { SourceMapSummary } from './sourceLeadMap';
import { SOURCE_VALIDITY_MS } from './sourceValidity';
import { normalizeWish } from './wishlistMatch';
import { discoveryCatalog } from './discoveryCatalog';
import { candidateProduct, discoveryHash, DiscoveryError, leadProduct, listingProduct,
  type DiscoveryCandidateRow, type DiscoveryListingRow, type DiscoveryProduct, type DiscoveryQuery } from './discovery';

// Public catalogue read model.
//
// Discovery used to rebuild every public product from its source row on every
// request. Here each product is built once, when its source row changes, and
// stored in PublicCatalogEntry; a request then reads one page of stored rows.
//
// - Database triggers (see the migration) mark a changed Listing, source
//   reference or external candidate in PublicCatalogDirty, in the same
//   transaction as the change, whoever makes it.
// - catalogSync() rebuilds the marked rows with the very functions the full scan
//   uses (listingProduct, leadProduct, candidateProduct). Readers call it first,
//   so a write is visible to the next read. A marked row that another step is
//   rebuilding at that moment is waited for, not rebuilt twice.
// - A row whose public state depends on the clock carries refreshAt, the next
//   instant at which it has to be rebuilt.
// - The background worker re-derives every entry now and then. It works in short
//   steps and never holds a write's mark together with background marks, so a
//   reader waits for one short step at most.
// - Until the first complete build has finished, and whenever
//   PUBLIC_CATALOG_DISABLED=1, callers use the full scan instead. So does a
//   reader whose wait ran out (see bypass()).

// Bump when anything that shapes a stored product changes (classification rules,
// price parsing, product fields). Every entry is then rebuilt in the background.
export const CATALOG_PROJECTION_VERSION = 1;

const KIND_RANK = { listing: 0, source: 1, external: 2 } as const;
type Kind = keyof typeof KIND_RANK;
type Ref = { kind: string; refId: string };
type MapLocation = NonNullable<DiscoveryProduct['mapLocation']>;
type Draft = { product: DiscoveryProduct | null; mapLocation: MapLocation | null; visibleUntil: Date | null; mapVisibleUntil: Date | null; refreshAt: Date | null };
type Tx = Prisma.TransactionClient;

const fingerprint = () => createHash('sha256').update(JSON.stringify([CATALOG_PROJECTION_VERSION, getApiUrl()])).digest('hex').slice(0, 32);
const disabled = () => process.env.PUBLIC_CATALOG_DISABLED === '1';
// Columns are timestamps without a zone, holding UTC. Compare in UTC whatever the session zone is.
const utc = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const pause = () => new Promise<void>(resolve => setImmediate(resolve));

// ---- when does a row's public state change without a write? -------------------
const instants = (values: unknown[]) => values.map(v => v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN).filter(t => Number.isFinite(t));
// Every rule that reads the clock compares it with one of these stored times,
// either directly or after the 48 hour or 14 day window. Listing each candidate
// (and the millisecond after it) can only cause an extra rebuild, never a missed one.
const around = (times: number[], offsets: number[]) => times.flatMap(t => offsets.flatMap(offset => [t + offset, t + offset + 1]));
export function leadBoundaries(row: ExternalSourceLead): number[] {
  const evidence = (row.evidence && typeof row.evidence === 'object' ? row.evidence : {}) as Record<string, any>;
  const media: any[] = Array.isArray(evidence.media) ? evidence.media : [];
  return around(instants([row.checkedAt, row.postedEarliestAt, row.postedLatestAt, evidence.observedListing?.firstObservedAt,
    evidence.photoInventory?.checkedAt, ...media.flatMap(m => [m?.checkedAt, m?.permissionExpiresAt])]), [0, 48 * 3_600_000, SOURCE_VALIDITY_MS]);
}
export function candidateBoundaries(row: DiscoveryCandidateRow): number[] {
  return [...around(instants([row.expiresAt, row.source.authorizationExpiresAt, row.source.enabledAt]), [0]),
    ...around(instants([row.observedAt]), [-5 * 60_000, 0, EXTERNAL_OBSERVATION_MAX_AGE_MS, SOURCE_VALIDITY_MS])];
}
export function nextRefresh(boundaries: number[], now: Date): Date | null {
  let next = Infinity;
  for (const time of boundaries) if (time > now.getTime() && time < next) next = time;
  return Number.isFinite(next) ? new Date(next) : null;
}

// ---- one source row -> one stored entry ---------------------------------------
function listingDraft(row: DiscoveryListingRow): Draft | null {
  if (!['ACTIVE', 'RESERVED'].includes(row.status) || !row.expiresAt || row.title.startsWith(NON_SALE_QA_PREFIX)) return null;
  // Built at the epoch so the map location is kept; its own deadline is applied when reading.
  const { mapLocation, ...product } = listingProduct(row, new Date(0), true);
  return { product, mapLocation: mapLocation ?? null, visibleUntil: row.expiresAt, mapVisibleUntil: mapLocation ? row.mapVisibleUntil : null, refreshAt: null };
}
function timedDraft(built: DiscoveryProduct | null, refreshAt: Date | null): Draft | null {
  // Not public now and nothing can make it public later: no entry at all.
  if (!built) return refreshAt ? { product: null, mapLocation: null, visibleUntil: null, mapVisibleUntil: null, refreshAt } : null;
  const { mapLocation, ...product } = built;
  return { product, mapLocation: mapLocation ?? null, visibleUntil: null, mapVisibleUntil: null, refreshAt };
}
export const leadDraft = (row: ExternalSourceLead, now: Date) => row.status === 'PUBLISHED' ? timedDraft(leadProduct(row, now, true), nextRefresh(leadBoundaries(row), now)) : null;
const candidateDraft = (row: DiscoveryCandidateRow, now: Date) => row.status === 'APPROVED' ? timedDraft(candidateProduct(row, now, true), nextRefresh(candidateBoundaries(row), now)) : null;

const iso = (date: Date | null) => date ? date.toISOString() : null;
function record(kind: Kind, refId: string, draft: Draft) {
  const product = draft.product, parsed = product ? Date.parse(product.date) : NaN;
  return {
    key: kind + ':' + refId, kind, refId, kindRank: KIND_RANK[kind], visible: !!product, visibleUntil: iso(draft.visibleUntil), refreshAt: iso(draft.refreshAt),
    product: product ?? {}, mapLocation: draft.mapLocation, mapVisibleUntil: iso(draft.mapVisibleUntil),
    longitude: draft.mapLocation ? draft.mapLocation.coordinates[0] : null, latitude: draft.mapLocation ? draft.mapLocation.coordinates[1] : null,
    // The same text the full scan searches: title, description and brand.
    searchText: product ? normalizeWish(product.title + ' ' + product.description + ' ' + (product.brand ?? '')) : '',
    mainId: product?.mainId ?? '', subId: product?.subId ?? '', condition: product?.condition ?? '', county: product?.county ?? null, price: product?.price ?? null,
    date: new Date(Number.isFinite(parsed) ? parsed : 0).toISOString(), thumbnailUrl: product?.thumbnailUrl ?? null,
    contentHash: discoveryHash([product, draft.mapLocation]).slice(0, 32),
  };
}
type Stored = ReturnType<typeof record>;
const sameRow = (stored: { contentHash: string; visible: boolean; visibleUntil: Date | null; refreshAt: Date | null; mapVisibleUntil: Date | null }, next: Stored) =>
  stored.contentHash === next.contentHash && stored.visible === next.visible && iso(stored.visibleUntil) === next.visibleUntil && iso(stored.refreshAt) === next.refreshAt && iso(stored.mapVisibleUntil) === next.mapVisibleUntil;

// Rebuild the entries of these source rows from their current committed state.
async function rebuild(tx: Tx, refs: Ref[], now: Date): Promise<void> {
  const wanted = new Map<string, { kind: Kind; refId: string }>();
  for (const ref of refs) if (ref.kind in KIND_RANK) wanted.set(ref.kind + ':' + ref.refId, { kind: ref.kind as Kind, refId: ref.refId });
  if (!wanted.size) return;
  const keys = [...wanted.keys()];
  // One builder per source row at a time, also across server processes, so an
  // older state can never be stored after a newer one.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(s.h) FROM (SELECT DISTINCT hashtextextended(x, 7411) AS h FROM unnest(ARRAY[${Prisma.join(keys)}]::text[]) AS x ORDER BY 1) s`;
  const ids = (kind: Kind) => [...wanted.values()].filter(ref => ref.kind === kind).map(ref => ref.refId);
  const drafts = new Map<string, Draft | null>(keys.map(key => [key, null]));
  let built = 0;
  // One row that cannot be built is left out and reported; it must not stop the
  // rest of the catalogue from being served or brought up to date.
  const build = async (key: string, make: () => Draft | null) => {
    try { drafts.set(key, make()); }
    catch { drafts.set(key, null); console.error('Public catalogue could not build ' + key + '; it is not shown. Details withheld'); }
    if (++built % 10 === 0) await pause();
  };
  const listings = ids('listing'), leads = ids('source'), candidates = ids('external');
  if (listings.length) for (const row of await tx.listing.findMany({ where: { id: { in: listings } }, select: publicListingSelect })) await build('listing:' + row.id, () => listingDraft(row));
  if (leads.length) for (const row of await tx.externalSourceLead.findMany({ where: { id: { in: leads } } })) await build('source:' + row.id, () => leadDraft(row, now));
  if (candidates.length) for (const row of await tx.externalListingCandidate.findMany({ where: { id: { in: candidates } }, select: externalCandidateSelect })) await build('external:' + row.id, () => candidateDraft(row, now));
  const stored = new Map((await tx.$queryRaw<Array<{ key: string; contentHash: string; visible: boolean; visibleUntil: Date | null; refreshAt: Date | null; mapVisibleUntil: Date | null }>>`
    SELECT "key", "contentHash", "visible", "visibleUntil", "refreshAt", "mapVisibleUntil" FROM "PublicCatalogEntry" WHERE "key" IN (${Prisma.join(keys)})`).map(row => [row.key, row]));
  const remove: string[] = [], write: Stored[] = [];
  for (const [key, draft] of drafts) {
    const ref = wanted.get(key)!, before = stored.get(key);
    if (!draft) { if (before) remove.push(key); continue; }
    const next = record(ref.kind, ref.refId, draft);
    if (!before || !sameRow(before, next)) write.push(next);
  }
  if (remove.length) await tx.$executeRaw`DELETE FROM "PublicCatalogEntry" WHERE "key" IN (${Prisma.join(remove)})`;
  if (write.length) await tx.$executeRaw`
    INSERT INTO "PublicCatalogEntry" ("key", "kind", "refId", "kindRank", "visible", "visibleUntil", "refreshAt", "product", "mapLocation", "mapVisibleUntil",
      "longitude", "latitude", "searchText", "mainId", "subId", "condition", "county", "price", "date", "thumbnailUrl", "contentHash", "updatedAt")
    SELECT r."key", r."kind", r."refId", r."kindRank", r."visible", r."visibleUntil", r."refreshAt", r."product", r."mapLocation", r."mapVisibleUntil",
      r."longitude", r."latitude", r."searchText", r."mainId", r."subId", r."condition", r."county", r."price", r."date", r."thumbnailUrl", r."contentHash", CURRENT_TIMESTAMP
    FROM jsonb_to_recordset(${JSON.stringify(write)}::jsonb) AS r("key" text, "kind" text, "refId" text, "kindRank" int, "visible" boolean, "visibleUntil" timestamp(3),
      "refreshAt" timestamp(3), "product" jsonb, "mapLocation" jsonb, "mapVisibleUntil" timestamp(3), "longitude" float8, "latitude" float8, "searchText" text,
      "mainId" text, "subId" text, "condition" text, "county" text, "price" float8, "date" timestamp(3), "thumbnailUrl" text, "contentHash" text)
    ON CONFLICT ("key") DO UPDATE SET "visible" = EXCLUDED."visible", "visibleUntil" = EXCLUDED."visibleUntil", "refreshAt" = EXCLUDED."refreshAt",
      "product" = EXCLUDED."product", "mapLocation" = EXCLUDED."mapLocation", "mapVisibleUntil" = EXCLUDED."mapVisibleUntil", "longitude" = EXCLUDED."longitude",
      "latitude" = EXCLUDED."latitude", "searchText" = EXCLUDED."searchText", "mainId" = EXCLUDED."mainId", "subId" = EXCLUDED."subId", "condition" = EXCLUDED."condition",
      "county" = EXCLUDED."county", "price" = EXCLUDED."price", "date" = EXCLUDED."date", "thumbnailUrl" = EXCLUDED."thumbnailUrl", "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = CURRENT_TIMESTAMP`;
  if (remove.length || write.length) await tx.$executeRaw`UPDATE "PublicCatalogState" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1`;
}

// Remove up to `limit` marks and return the rows they name. One call takes marks
// of one class only: that of the first mark nobody else is holding, writes before
// background marks. A write's mark is therefore never held for as long as a batch
// of background marks takes, which readers would wait for.
//
// The marks are chosen in a materialised CTE, so they are chosen exactly once.
// As DELETE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED) the choice
// can be the inner side of a nested loop, the plan the database keeps for a table
// that is usually empty. It is then made again for every mark, each time skipping
// the ones this statement has already removed, and the statement takes every mark
// of the class instead of `limit`: one step becomes the whole backlog.
export async function takeMarks(tx: Tx, maxPriority: number, limit: number): Promise<Ref[]> {
  return tx.$queryRaw<Ref[]>`
    WITH "taken" AS MATERIALIZED (
      SELECT "id" FROM "PublicCatalogDirty"
      WHERE "priority" = (SELECT "priority" FROM "PublicCatalogDirty" WHERE "priority" <= ${maxPriority} ORDER BY "priority", "id" LIMIT 1 FOR UPDATE SKIP LOCKED)
      ORDER BY "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    DELETE FROM "PublicCatalogDirty" d USING "taken" WHERE d."id" = "taken"."id"
    RETURNING d."kind", d."refId"`;
}

// Take up to `limit` marked rows (and rows whose clock deadline has passed) and
// rebuild them. The marks are removed in the same transaction as the rebuild.
async function drain(maxPriority: number, limit: number, clock: () => Date = () => new Date()): Promise<number> {
  return prisma.$transaction(async tx => {
    const now = clock();
    const marks = await takeMarks(tx, maxPriority, limit);
    const due = await tx.$queryRaw<Ref[]>`SELECT "kind", "refId" FROM "PublicCatalogEntry" WHERE "refreshAt" <= ${utc(now)} LIMIT ${limit}`;
    if (marks.length || due.length) await rebuild(tx, [...marks, ...due], now);
    return marks.length + due.length;
  }, { timeout: 60_000, maxWait: 10_000 });
}

const WRITE = 0, BACKGROUND = 1;
// More pending changes than this are not rebuilt inside a request.
const SYNC_LIMIT = 2000;
// A pending change that another step has taken is waited for: one look every
// SYNC_WAIT_MS, SYNC_ROUNDS looks at most (about four seconds). Counted in looks,
// not on the clock, so a stalled process cannot make every waiting reader give up
// at once.
const SYNC_WAIT_MS = 20, SYNC_ROUNDS = 150;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
type Sync = 'ok' | 'backlog' | 'busy';
// Rebuild what writes have marked and what the clock has made due. Says how many rows that was.
async function absorb(clock?: () => Date): Promise<number> {
  let rows = 0;
  for (let step = 0; step < 20; step++) {
    const taken = await drain(WRITE, 500, clock);
    if (!taken) break;
    rows += taken;
  }
  return rows;
}
let syncing: Promise<number> | null = null;
// Bring the read model up to date with every committed write and say whether it
// now is. Cheap when there is nothing to do: one indexed probe. When too much is
// pending (a mass update), the answer is no: the caller uses the full scan, which
// is always right, and the background worker catches up.
//
// A mark is removed in the transaction that rebuilds its row, and stays visible to
// the probe until that transaction commits. So "no write mark and nothing due"
// means every write committed before the probe is in the entries, whoever rebuilt it.
async function sync(now: Date): Promise<Sync> {
  // A caller that asks about another moment (tests of deadlines) rebuilds as of that moment.
  const moment = now, shifted = Math.abs(now.getTime() - Date.now()) > 1000;
  for (let round = 0; round < SYNC_ROUNDS; round++) {
    const [probe] = await prisma.$queryRaw<Array<{ marks: number; due: boolean }>>`
      SELECT (SELECT count(*)::int FROM (SELECT 1 FROM "PublicCatalogDirty" WHERE "priority" = ${WRITE} LIMIT ${SYNC_LIMIT + 1}) m) AS "marks",
        EXISTS (SELECT 1 FROM "PublicCatalogEntry" WHERE "refreshAt" <= ${utc(now)}) AS "due"`;
    if (!probe || (!probe.marks && !probe.due)) return 'ok';
    if (probe.marks > SYNC_LIMIT) return 'backlog';
    let rows: number;
    if (shifted) rows = await absorb(() => moment);
    else {
      // Requests of this process share one absorption.
      syncing ??= absorb().finally(() => { syncing = null; });
      rows = await syncing;
      now = new Date();
    }
    // Nothing could be taken: another step holds those marks and removes them when it commits.
    if (!rows) await sleep(SYNC_WAIT_MS);
  }
  return 'busy';
}
export async function catalogSync(now = new Date()): Promise<boolean> {
  return await sync(now) === 'ok';
}

// A read the read model could not answer is answered by the full scan: right, but
// slow. Each cause is reported when it starts and ever less often while it lasts:
// at its 1st, 2nd, 4th, 8th… read. A minute without one starts the count again.
// Counts only.
type Bypass = 'disabled' | 'building' | 'backlog' | 'busy' | 'error';
const BYPASS_EPISODE_MS = 60_000;
const bypassed = new Map<Bypass, { reads: number; last: number }>();
function bypass(reason: Bypass): false {
  const now = Date.now(), entry = bypassed.get(reason) ?? { reads: 0, last: 0 };
  bypassed.set(reason, entry);
  if (now - entry.last >= BYPASS_EPISODE_MS) entry.reads = 0;
  entry.last = now;
  if ((++entry.reads & (entry.reads - 1)) === 0) console.warn('Public catalogue bypassed, full scan used: reason ' + reason + ', reads so far ' + entry.reads);
  return false;
}

// ---- first build, readiness and background upkeep ------------------------------
async function markAll(tx: Tx): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "PublicCatalogDirty" ("kind", "refId", "priority")
    SELECT 'listing', "id", ${BACKGROUND} FROM "Listing" WHERE "status" IN ('ACTIVE', 'RESERVED')
    UNION SELECT 'source', "id", ${BACKGROUND} FROM "ExternalSourceLead" WHERE "status" = 'PUBLISHED'
    UNION SELECT 'external', "id", ${BACKGROUND} FROM "ExternalListingCandidate" WHERE "status" = 'APPROVED'
    UNION SELECT "kind", "refId", ${BACKGROUND} FROM "PublicCatalogEntry"`;
}
let ready = false, readyCheckedAt = 0;
async function readState(): Promise<{ fingerprint: string; readyAt: Date | null } | null> {
  const [state] = await prisma.$queryRaw<Array<{ fingerprint: string; readyAt: Date | null }>>`SELECT "fingerprint", "readyAt" FROM "PublicCatalogState" WHERE "id" = 1`;
  return state ?? null;
}
// A complete build for this code and configuration exists.
async function catalogBuilt(): Promise<boolean> {
  if (ready) return true;
  if (Date.now() - readyCheckedAt < 2000) return false;
  readyCheckedAt = Date.now();
  try { const state = await readState(); ready = !!state && state.fingerprint === fingerprint() && !!state.readyAt; }
  catch { ready = false; }
  return ready;
}
// True when the read model can answer for this moment: it is switched on, built,
// and up to date with every committed write. Otherwise the caller uses the full scan.
export async function catalogReady(now = new Date()): Promise<boolean> {
  if (disabled()) return bypass('disabled');
  try {
    if (!(await catalogBuilt())) return bypass('building');
    const state = await sync(now);
    return state === 'ok' || bypass(state);
  } catch { return bypass('error'); }
}
// Start (or restart, after a rule or address change) a complete build.
async function prepare(): Promise<void> {
  const current = fingerprint();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741100)`;
    const [state] = await tx.$queryRaw<Array<{ fingerprint: string }>>`SELECT "fingerprint" FROM "PublicCatalogState" WHERE "id" = 1`;
    if (state?.fingerprint === current) return;
    await tx.$executeRaw`
      INSERT INTO "PublicCatalogState" ("id", "fingerprint", "readyAt") VALUES (1, ${current}, NULL)
      ON CONFLICT ("id") DO UPDATE SET "fingerprint" = ${current}, "readyAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP`;
    await markAll(tx);
  }, { timeout: 60_000 });
}
async function finish(): Promise<boolean> {
  const [left] = await prisma.$queryRaw<Array<{ pending: boolean }>>`SELECT EXISTS (SELECT 1 FROM "PublicCatalogDirty") AS "pending"`;
  if (left?.pending) return false;
  await prisma.$executeRaw`UPDATE "PublicCatalogState" SET "readyAt" = COALESCE("readyAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1 AND "fingerprint" = ${fingerprint()}`;
  readyCheckedAt = 0;
  return true;
}
// Build everything now. Used by tests and one-off tools; the server does the same
// work in small steps through startPublicCatalogWorker().
export async function buildCatalog(): Promise<void> {
  await prepare();
  for (let batch = 0; batch < 100_000 && await drain(BACKGROUND, 200) > 0; batch++);
  await finish();
  ready = false; readyCheckedAt = 0;
  await catalogBuilt();
}
// Re-derive every entry from its source row. Nothing changes when the read model
// is already right; a difference is repaired. Does not affect readiness.
export async function reconcileCatalog(): Promise<void> {
  await prisma.$transaction(tx => markAll(tx), { timeout: 60_000 });
}

const RECONCILE_EVERY_MS = 24 * 3_600_000;
// A run of upkeep longer than this many rows is reported when it ends.
const UPKEEP_REPORT_ROWS = 200;
export function startPublicCatalogWorker() {
  let stopped = false, running = false, prepared = false, size = 40, reconciledAt = Date.now() - RECONCILE_EVERY_MS + 60_000, timer: NodeJS.Timeout | undefined;
  let run = { rows: 0, steps: 0, longest: 0, since: 0, until: 0 };
  const schedule = (ms: number) => { if (!stopped) { timer = setTimeout(() => void cycle(), ms); timer.unref(); } };
  async function cycle() {
    if (running || stopped) return;
    running = true;
    let worked = 0;
    try {
      if (!prepared) { await prepare(); prepared = true; }
      const began = Date.now();
      worked = await drain(BACKGROUND, size);
      // Short steps: a reader that needs a row of the step in progress waits for
      // that step. Larger ones only while the first build lasts, when nobody reads
      // the entries yet.
      size = worked >= size && !(await catalogBuilt()) ? Math.min(size * 2, 400) : 40;
      if (worked) {
        const ended = Date.now();
        if (!run.steps) run.since = began;
        run.rows += worked; run.steps++; run.longest = Math.max(run.longest, ended - began); run.until = ended;
      } else {
        // Counts and durations only.
        if (run.rows >= UPKEEP_REPORT_ROWS) console.log('Public catalogue upkeep: ' + run.rows + ' rows in ' + run.steps + ' steps over ' + ((run.until - run.since) / 1000).toFixed(1) + ' s, longest step ' + run.longest + ' ms');
        run = { rows: 0, steps: 0, longest: 0, since: 0, until: 0 };
        if (!(await catalogBuilt())) await finish();
        else if (Date.now() - reconciledAt >= RECONCILE_EVERY_MS) { reconciledAt = Date.now(); await reconcileCatalog(); }
      }
    } catch { console.error('Public catalogue upkeep temporarily unavailable; details withheld'); }
    finally { running = false; schedule(worked ? 25 : 2000); }
  }
  schedule(0);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

// ---- reading ---------------------------------------------------------------------
// The rows the public may see right now. Feature switches and the private review
// exclusions are read at request time, exactly as the full scan reads them.
function scope(now: Date, alias = Prisma.raw('e')) {
  const kinds = ['listing', ...(process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1' ? ['source'] : []), ...(process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED === '1' ? ['external'] : [])];
  const hidden = privateReviewListingIds().map(id => 'listing:' + id);
  return Prisma.sql`${alias}."visible" AND (${alias}."visibleUntil" IS NULL OR ${alias}."visibleUntil" > ${utc(now)}) AND ${alias}."kind" IN (${Prisma.join(kinds)})
    ${hidden.length ? Prisma.sql`AND ${alias}."key" NOT IN (${Prisma.join(hidden)})` : Prisma.empty}`;
}
const locatedAt = (now: Date) => Prisma.sql`(e."mapLocation" IS NOT NULL AND (e."mapVisibleUntil" IS NULL OR e."mapVisibleUntil" > ${utc(now)}))`;
const withMap = (row: { product: unknown; mapLocation: unknown; located: boolean }) => ({ ...(row.product as DiscoveryProduct), mapLocation: row.located ? row.mapLocation as MapLocation : null });

// Every public product, in the order the full scan returns them.
// Readers call catalogReady(now) first and pass synced; called on their own they check for themselves.
const insist = async (now: Date, synced: boolean) => { if (!synced && !(await catalogSync(now))) throw new DiscoveryError(503, 'DISCOVERY_UNAVAILABLE'); };
export async function catalogProducts(now = new Date(), map = false, synced = false): Promise<DiscoveryProduct[]> {
  await insist(now, synced);
  const products: DiscoveryProduct[] = [];
  await prisma.$transaction(async tx => {
    let after: { kindRank: number; refId: string } | null = null;
    for (;;) {
      const rows: Array<{ product: unknown; mapLocation: unknown; located: boolean; kindRank: number; refId: string }> = await tx.$queryRaw`
        SELECT e."product", e."mapLocation", ${locatedAt(now)} AS "located", e."kindRank", e."refId" FROM "PublicCatalogEntry" e
        WHERE ${scope(now)} ${after ? Prisma.sql`AND (e."kindRank", e."refId") > (${after.kindRank}, ${after.refId})` : Prisma.empty}
        ORDER BY e."kindRank", e."refId" LIMIT 500`;
      for (const row of rows) products.push(map ? withMap(row) : row.product as DiscoveryProduct);
      if (rows.length < 500) return;
      // The same ceiling as the full scan: these callers hold the whole set in memory.
      if (products.length >= 20_000) throw new DiscoveryError(503, 'DISCOVERY_SCAN_CAPACITY');
      after = rows[rows.length - 1];
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20_000, maxWait: 10_000 });
  return products;
}

export async function catalogProduct(key: string, now = new Date(), synced = false): Promise<DiscoveryProduct | null> {
  await insist(now, synced);
  const [row] = await prisma.$queryRaw<Array<{ product: unknown }>>`SELECT e."product" FROM "PublicCatalogEntry" e WHERE e."key" = ${key} AND ${scope(now)}`;
  return row ? row.product as DiscoveryProduct : null;
}

// Public source references currently shown, whatever the feature switch says; the caller applies the switch.
export async function catalogSourceCount(now = new Date(), synced = false): Promise<number> {
  await insist(now, synced);
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS "count" FROM "PublicCatalogEntry" e WHERE e."kind" = 'source' AND e."visible"`;
  return row?.count ?? 0;
}

// The places of the public source references that have one, each with how many references share it and its first
// reference by id. The same answer as scanSourceMap(); the caller applies the feature switch.
// A reference that is public here has passed the lead rules, and those allow coordinates on every kind of place
// except "ask the seller", which must have none. So "has coordinates" is the whole test, and the large evidence
// column is never read.
export async function catalogSourceMap(now = new Date(), synced = false): Promise<SourceMapSummary> {
  await insist(now, synced);
  const points = await prisma.$queryRaw<SourceMapSummary['points']>`
    SELECT min(l."id") AS "id", l."latitude", l."longitude", count(*)::int AS "count", (array_agg(l."publicPlaceName" ORDER BY l."id"))[1] AS "publicPlaceName"
    FROM "PublicCatalogEntry" e JOIN "ExternalSourceLead" l ON l."id" = e."refId"
    WHERE e."kind" = 'source' AND e."visible" AND l."latitude" IS NOT NULL AND l."longitude" IS NOT NULL
    GROUP BY l."latitude", l."longitude" ORDER BY 1`;
  return { total: points.reduce((sum, point) => sum + point.count, 0), points };
}

// One page of discovery, with the same result discoveryPage() gives over the full
// scan: filters, facets, ordering, totals and a cursor bound to the query and to
// the exact rows it covers. The database does the set work; only the page's own
// products are read.
export async function catalogDiscoveryPage(query: DiscoveryQuery, now = new Date(), synced = false) {
  await insist(now, synced);
  const map = query.presentation === 'map', located = locatedAt(now);
  const where: Prisma.Sql[] = [scope(now)];
  if (query.source !== 'all') where.push(Prisma.sql`e."kind" = ${query.source}`);
  if (query.condition) where.push(Prisma.sql`e."condition" = ${query.condition}`);
  if (query.county) where.push(Prisma.sql`e."county" = ${query.county}`);
  for (const word of normalizeWish(query.q).split(' ').filter(Boolean)) where.push(Prisma.sql`position(${word} in e."searchText") > 0`);
  if (query.min !== undefined) where.push(Prisma.sql`e."price" IS NOT NULL AND e."price" >= ${query.min}::float8`);
  if (query.max !== undefined) where.push(Prisma.sql`e."price" IS NOT NULL AND e."price" <= ${query.max}::float8`);
  // Like the full scan, a map area only narrows the products that have a place on the map.
  if (map && query.bbox) where.push(Prisma.sql`(NOT ${located} OR (e."longitude" >= ${query.bbox[0]}::float8 AND e."longitude" <= ${query.bbox[2]}::float8 AND e."latitude" >= ${query.bbox[1]}::float8 AND e."latitude" <= ${query.bbox[3]}::float8))`);
  const base = Prisma.sql`SELECT e."key", e."kind", e."kindRank", e."refId", e."mainId", e."subId", e."thumbnailUrl", e."contentHash", e."price", e."date", ${located} AS "located"
    FROM "PublicCatalogEntry" e WHERE ${Prisma.join(where, ' AND ')}`;
  const category = Prisma.sql`${query.main ? Prisma.sql`r."mainId" = ${query.main}` : Prisma.sql`TRUE`} AND ${query.sub ? Prisma.sql`r."subId" = ${query.sub}` : Prisma.sql`TRUE`}`;
  // Newest first, ties by key. Keys are lowercase ASCII, where byte order is the order localeCompare gives.
  const newest = Prisma.sql`r."date" DESC, r."key" COLLATE "C" ASC`;
  const order = Prisma.sql`${map ? Prisma.sql`r."located" DESC,` : Prisma.empty}
    ${query.sort === 'price-asc' ? Prisma.sql`(r."price" IS NULL) ASC, r."price" ASC,` : query.sort === 'price-desc' ? Prisma.sql`(r."price" IS NULL) ASC, r."price" DESC,` : Prisma.empty} ${newest}`;
  const queryHash = discoveryHash({ ...query, cursor: '', limit: 0 });
  const stale = () => new DiscoveryError(409, 'DISCOVERY_RESULTS_CHANGED');
  let cursor: { snapshot?: unknown; query?: unknown; after?: unknown } | null = null;
  if (query.cursor) {
    try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()); } catch { throw stale(); }
    if (!cursor || typeof cursor.snapshot !== 'string' || cursor.query !== queryHash || typeof cursor.after !== 'string') throw stale();
  }
  // One statement, so the facets, the totals, the snapshot token and the page all
  // describe the same instant. A first page takes the top rows; a later page
  // first finds where the previous one ended.
  const page = cursor
    ? Prisma.sql`SELECT x."key", x."located", x."position" FROM ranked x WHERE x."position" > (SELECT a."position" FROM anchor a) AND x."position" <= (SELECT a."position" FROM anchor a) + ${query.limit}`
    : Prisma.sql`SELECT t."key", t."located", row_number() OVER () AS "position" FROM (SELECT r."key", r."located" FROM chosen r ORDER BY ${order} LIMIT ${query.limit}) t`;
  const [facts] = await prisma.$queryRaw<Array<{ facets: Array<{ mainId: string; subId: string; n: number; thumb: string | null }>; summary: { total: number; listing: number; source: number; external: number; located: number; signature: string };
    counties: string[]; anchor: number | null; items: Array<{ product: unknown; mapLocation: unknown; located: boolean }> }>>`
    WITH base AS MATERIALIZED (${base}), chosen AS MATERIALIZED (SELECT r.* FROM base r WHERE ${category})
      ${cursor ? Prisma.sql`, ranked AS MATERIALIZED (SELECT r."key", r."located", row_number() OVER (ORDER BY ${order}) AS "position" FROM chosen r),
        anchor AS (SELECT (SELECT x."position" FROM ranked x WHERE x."key" = ${cursor.after as string}) AS "position")` : Prisma.empty},
      page AS (${page})
    SELECT
      (SELECT coalesce(jsonb_agg(f), '[]'::jsonb) FROM (
        SELECT r."mainId", r."subId", count(*)::int AS "n",
          -- The thumbnail of the first product in scan order (kind, then id), found without sorting the group.
          split_part(min((r."kindRank"::text || r."refId" || chr(10) || r."thumbnailUrl") COLLATE "C") FILTER (WHERE r."thumbnailUrl" IS NOT NULL AND r."thumbnailUrl" <> ''), chr(10), 2) AS "thumb"
        FROM base r GROUP BY r."mainId", r."subId") f) AS "facets",
      (SELECT jsonb_build_object('total', count(*), 'listing', count(*) FILTER (WHERE r."kind" = 'listing'), 'source', count(*) FILTER (WHERE r."kind" = 'source'),
        'external', count(*) FILTER (WHERE r."kind" = 'external'), 'located', count(*) FILTER (WHERE r."located"),
        -- Which rows, in which state. Their order follows from that, so two independent sums identify the result without sorting it.
        'signature', coalesce(sum(hashtextextended(r."key" || r."contentHash" || CASE WHEN r."located" THEN '+' ELSE '-' END, 0)::numeric), 0)::text || '/' ||
          coalesce(sum(hashtextextended(r."key" || r."contentHash" || CASE WHEN r."located" THEN '+' ELSE '-' END, 1)::numeric), 0)::text)
        FROM chosen r) AS "summary",
      (SELECT coalesce(jsonb_agg(d."county"), '[]'::jsonb) FROM (
        SELECT c."county" FROM "PublicCatalogEntry" c WHERE ${scope(now, Prisma.raw('c'))} AND c."county" IS NOT NULL AND c."county" <> '' GROUP BY c."county") d) AS "counties",
      ${cursor ? Prisma.sql`(SELECT a."position"::int FROM anchor a)` : Prisma.sql`0`} AS "anchor",
      (SELECT coalesce(jsonb_agg(jsonb_build_object('product', p."product", 'mapLocation', p."mapLocation", 'located', g."located") ORDER BY g."position"), '[]'::jsonb)
        FROM page g JOIN "PublicCatalogEntry" p ON p."key" = g."key") AS "items"`;
  const summary = facts.summary, signature = discoveryHash([summary.total, summary.signature, map]);
  // The cursor is only good for the exact result it was issued for.
  if (cursor && (cursor.snapshot !== signature || facts.anchor === null)) throw stale();
  const start = facts.anchor ?? 0;
  const items = facts.items.map(row => map ? withMap(row) : row.product as DiscoveryProduct);
  const facet = new Map(facts.facets.map(f => [f.mainId + '\n' + f.subId, f]));
  const categories = discoveryCatalog.map(c => ({ ...c, count: facts.facets.filter(f => f.mainId === c.id).reduce((sum, f) => sum + f.n, 0),
    children: c.children.map(s => ({ ...s, count: facet.get(c.id + '\n' + s.id)?.n ?? 0, thumbnailUrl: facet.get(c.id + '\n' + s.id)?.thumb ?? null })) }));
  const more = start + items.length < summary.total;
  return {
    items, categories,
    nextCursor: more ? Buffer.from(JSON.stringify({ snapshot: signature, query: queryHash, after: items[items.length - 1].key })).toString('base64url') : null,
    snapshot: signature, total: summary.total, counts: { listing: summary.listing, source: summary.source, external: summary.external },
    counties: [...facts.counties].sort(), complete: true, generatedAt: new Date().toISOString(), unknownPriceExcluded: query.min !== undefined || query.max !== undefined,
    ...(map ? { mapTotals: { located: summary.located, unmapped: summary.total - summary.located }, geographicScope: query.bbox ?? null } : {}),
  };
}
