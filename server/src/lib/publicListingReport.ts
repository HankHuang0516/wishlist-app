import { Prisma, PrismaClient } from '@prisma/client';
import { leadCurrent } from './sourceLeadRules';

// Public, key-free report of actual listing results. Everything here is an
// aggregate: no query in this file selects a title, URL, seller, photo or ID
// into the report, and buildListingReport only copies numbers and timestamps.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Asia/Taipei has no daylight saving, so a whole-hour offset is exact and every
// reporting day starts on a UTC hour boundary (16:00Z).
const TAIPEI_OFFSET_MS = 8 * HOUR_MS;

export const REPORT_TIME_ZONE = 'Asia/Taipei';
export const DEFAULT_REPORT_HOURS = 168;
export const MAX_REPORT_HOURS = 2160;
export const REFRESH_INTERVAL_MS = 120_000;
export const MAX_STALE_MS = 900_000;
const VISIBLE_SCAN_BATCH = 500;
const VISIBLE_SCAN_BUDGET_MS = 15_000;

export type HourBucket = { hour: string; firstPublished: number; republished: number; stillPublished: number };
export type ListingSnapshot = {
  asOf: string;
  buckets: HourBucket[];
  last60Minutes: number;
  coverageStart: string | null;
  latestFirstPublishAt: string | null;
  firstPublishedNotPublishedNow: number;
  records: { total: number; published: number; privatePending: number; withdrawn: number; publishedWithoutPublishEvent: number };
  privatePendingNotUpdatedIn24h: number;
  oldestPrivatePendingUpdateAt: string | null;
  publicSearchEnabled: boolean;
  publiclyVisible: number | null;
};

const iso = (ms: number) => new Date(ms).toISOString();
const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;
const taipeiDayStart = (ms: number) => Math.floor((ms + TAIPEI_OFFSET_MS) / DAY_MS) * DAY_MS - TAIPEI_OFFSET_MS;
const taipeiDate = (dayStart: number) => iso(dayStart + TAIPEI_OFFSET_MS).slice(0, 10);
const unavailable = (reason: string) => ({ value: null, state: 'unavailable' as const, reason });

// The event log is the only timestamped record of a publication, and it is
// written in the same transaction as the status change. `createdAt` is a
// timestamp WITHOUT time zone holding UTC, so it is bucketed as-is here and only
// converted to Taipei days from whole UTC hours in buildListingReport.
const SUCCESS_EVENTS = Prisma.sql`
  SELECT e."leadId", e."createdAt",
         row_number() OVER (PARTITION BY e."leadId" ORDER BY e."createdAt", e.id) AS seq
  FROM "SourceLeadRecordEvent" e
  WHERE e.action = 'PUBLISH'
     OR (e.action = 'AUTO_REFERENCE_SAVE' AND e."afterSnapshot" #>> '{result,autoDisplay,state}' = 'DISPLAYED')`;
const utcText = (column: Prisma.Sql) => Prisma.sql`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

type ReportDb = Pick<PrismaClient, '$transaction' | 'externalSourceLead'>;

export async function loadListingSnapshot(db: ReportDb, publicSearchEnabled: boolean): Promise<ListingSnapshot> {
  const { totals, buckets } = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const buckets = await tx.$queryRaw<HourBucket[]>(Prisma.sql`
      WITH success AS (${SUCCESS_EVENTS})
      SELECT ${utcText(Prisma.sql`date_trunc('hour', s."createdAt")`)} AS hour,
             (count(*) FILTER (WHERE s.seq = 1))::int AS "firstPublished",
             (count(*) FILTER (WHERE s.seq > 1))::int AS republished,
             (count(*) FILTER (WHERE s.seq = 1 AND l.status = 'PUBLISHED'))::int AS "stillPublished"
      FROM success s JOIN "ExternalSourceLead" l ON l.id = s."leadId"
      GROUP BY date_trunc('hour', s."createdAt")
      ORDER BY date_trunc('hour', s."createdAt")`);
    const rows = await tx.$queryRaw<any[]>(Prisma.sql`
      WITH success AS (${SUCCESS_EVENTS}), clock AS (SELECT now() AT TIME ZONE 'UTC' AS at)
      SELECT ${utcText(Prisma.sql`(SELECT at FROM clock)`)} AS "asOf",
        (SELECT count(*) FROM success s WHERE s.seq = 1 AND s."createdAt" > (SELECT at FROM clock) - interval '1 hour')::int AS "last60Minutes",
        ${utcText(Prisma.sql`(SELECT min(s."createdAt") FROM success s)`)} AS "coverageStart",
        ${utcText(Prisma.sql`(SELECT max(s."createdAt") FROM success s WHERE s.seq = 1)`)} AS "latestFirstPublishAt",
        (SELECT count(*) FROM success s JOIN "ExternalSourceLead" l ON l.id = s."leadId" WHERE s.seq = 1 AND l.status <> 'PUBLISHED')::int AS "firstPublishedNotPublishedNow",
        (SELECT count(*) FROM "ExternalSourceLead")::int AS total,
        (SELECT count(*) FROM "ExternalSourceLead" WHERE status = 'PUBLISHED')::int AS published,
        (SELECT count(*) FROM "ExternalSourceLead" WHERE status = 'PRIVATE_PENDING')::int AS "privatePending",
        (SELECT count(*) FROM "ExternalSourceLead" WHERE status = 'WITHDRAWN')::int AS withdrawn,
        (SELECT count(*) FROM "ExternalSourceLead" l WHERE l.status = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM success s WHERE s."leadId" = l.id))::int AS "publishedWithoutPublishEvent",
        (SELECT count(*) FROM "ExternalSourceLead" WHERE status = 'PRIVATE_PENDING' AND "updatedAt" < (SELECT at FROM clock) - interval '24 hours')::int AS "privatePendingNotUpdatedIn24h",
        ${utcText(Prisma.sql`(SELECT min("updatedAt") FROM "ExternalSourceLead" WHERE status = 'PRIVATE_PENDING')`)} AS "oldestPrivatePendingUpdateAt"`);
    return { totals: rows[0], buckets };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });

  return {
    ...toSnapshot(totals, buckets, publicSearchEnabled),
    publiclyVisible: publicSearchEnabled ? await countPubliclyVisible(db, new Date(totals.asOf)) : 0,
  };
}

// Same eligibility check as the public search and /api/source-leads/summary.
// Batched so a refresh never holds every row's evidence in memory at once. The
// event-log counts do not depend on this, so a failed or over-budget scan gives
// null for this one number instead of losing the whole report.
async function countPubliclyVisible(db: ReportDb, now: Date): Promise<number | null> {
  const deadline = Date.now() + VISIBLE_SCAN_BUDGET_MS;
  let visible = 0;
  let cursor: string | null = null;
  try {
    for (;;) {
      const rows: any[] = await db.externalSourceLead.findMany({ where: { status: 'PUBLISHED' }, orderBy: { id: 'asc' }, take: VISIBLE_SCAN_BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const row of rows) if (leadCurrent(row, now)) visible += 1;
      if (rows.length < VISIBLE_SCAN_BATCH) return visible;
      if (Date.now() > deadline) return null;
      cursor = rows[rows.length - 1].id;
    }
  } catch (error) {
    console.error('[listing-report] visible scan failed', (error as { code?: string })?.code ?? (error as Error)?.name ?? 'UNKNOWN');
    return null;
  }
}

function toSnapshot(totals: any, buckets: HourBucket[], publicSearchEnabled: boolean): Omit<ListingSnapshot, 'publiclyVisible'> {
  return {
    asOf: totals.asOf,
    buckets,
    last60Minutes: totals.last60Minutes,
    coverageStart: totals.coverageStart,
    latestFirstPublishAt: totals.latestFirstPublishAt,
    firstPublishedNotPublishedNow: totals.firstPublishedNotPublishedNow,
    records: { total: totals.total, published: totals.published, privatePending: totals.privatePending, withdrawn: totals.withdrawn, publishedWithoutPublishEvent: totals.publishedWithoutPublishEvent },
    privatePendingNotUpdatedIn24h: totals.privatePendingNotUpdatedIn24h,
    oldestPrivatePendingUpdateAt: totals.oldestPrivatePendingUpdateAt,
    publicSearchEnabled,
  };
}

const DEFINITIONS = {
  successfulListing: '一筆紀錄第一次成功公開的那一刻。依據是與狀態變更同一交易寫入的 PUBLISH 事件（或自動展示成功事件），不是候選、擷取或預測。',
  deduplication: '每筆紀錄只算一次，取最早的成功事件。同一 operationId 重試會回放既有結果，不產生新事件，所以不會重算。',
  republishedNotCounted: '重查或改價後再次公開的事件，只列在這個欄位，不算新上架。',
  withdrawals: '已售出或下架不會回頭扣除當時的成功數，歷史數字不會變動；目前已不公開的數量看 firstPublishedNotPublishedNow 與每日的 stillPublishedNow。',
  zeroVersusNull: '涵蓋範圍內的 0 是目前紀錄流程實際沒有上架（事件與狀態同交易寫入，不會漏記）；舊匯入路徑不寫事件，只會出現在 publishedWithoutPublishEvent。null 代表無法確認，例如事件紀錄開始之前。',
  legacyRecords: 'publishedWithoutPublishEvent 是經舊匯入路徑寫入、沒有上架事件的資料，沒有上架時間，不計入成功數，也不代表目前公開可見。',
  publiclyVisible: '買家目前實際搜尋得到的數量，與公開搜尋使用同一套檢查，在其他計數之後才掃描，可能與 records.published 差幾筆。檢查未完成時為 null。',
  waitingToPublish: '目前存成私人待審的紀錄。時間依最後更新計算，照片重傳或重新儲存都會更新，所以不代表已等待多久。',
  rates: '由已結束的整點小時實際計算，不含進行中的小時；coveredHours 不足時只以涵蓋到的小時為分母。',
  partial: 'partial=true 表示該小時或該日尚未結束，數字還會增加。',
  freshness: 'asOf 是資料庫快照時間。state=stale 表示最近一次重新整理失敗，回傳的是上一份成功結果。secondsSinceLatestFirstPublish 只說明多久沒有新上架，與資料是否新鮮無關。',
};

const PIPELINE_STATE_NOT_ON_SERVER = 'PIPELINE_STATE_NOT_ON_SERVER';
const ATTEMPTS_NOT_RECORDED = 'ATTEMPTS_NOT_RECORDED_ON_SERVER';

export function buildListingReport(snapshot: ListingSnapshot, options: { hours: number; servedAt: number; stale: boolean; targetPerHour: number | null }) {
  const { hours, servedAt, stale, targetPerHour } = options;
  const asOf = Date.parse(snapshot.asOf);
  const currentHour = floorHour(asOf);
  const coverageHour = snapshot.coverageStart === null ? null : floorHour(Date.parse(snapshot.coverageStart));
  const byHour = new Map(snapshot.buckets.map(b => [Date.parse(b.hour), b]));
  const covered = (hour: number) => coverageHour !== null && hour >= coverageHour;

  const sum = (from: number, until: number, pick: (b: HourBucket) => number) => {
    let total = 0;
    for (const [hour, bucket] of byHour) if (hour >= from && hour < until) total += pick(bucket);
    return total;
  };
  const first = (b: HourBucket) => b.firstPublished;

  // Hourly series: hours before the event log began stay null rather than zero.
  const windowStart = currentHour - (hours - 1) * HOUR_MS;
  const points = [];
  for (let hour = windowStart; hour <= currentHour; hour += HOUR_MS) {
    const bucket = byHour.get(hour);
    points.push(covered(hour)
      ? { hourStart: iso(hour), firstPublished: bucket?.firstPublished ?? 0, republishedNotCounted: bucket?.republished ?? 0, covered: true, ...(hour === currentHour ? { partial: true } : {}) }
      : { hourStart: iso(hour), firstPublished: null, republishedNotCounted: null, covered: false });
  }
  const gapEnd = coverageHour === null ? currentHour + HOUR_MS : Math.min(coverageHour, currentHour + HOUR_MS);
  const gaps = windowStart < gapEnd ? [{ from: iso(windowStart), to: iso(gapEnd), reason: 'BEFORE_EVENT_LOG' }] : [];

  // Daily series rolls whole UTC hours up to Taipei days, from the first covered day.
  const todayStart = taipeiDayStart(asOf);
  const dayTotals = new Map<number, { firstPublished: number; republished: number; stillPublished: number }>();
  for (const [hour, bucket] of byHour) {
    const day = taipeiDayStart(hour);
    const totals = dayTotals.get(day) ?? { firstPublished: 0, republished: 0, stillPublished: 0 };
    totals.firstPublished += bucket.firstPublished;
    totals.republished += bucket.republished;
    totals.stillPublished += bucket.stillPublished;
    dayTotals.set(day, totals);
  }
  const daily = [];
  if (coverageHour !== null) {
    for (let day = taipeiDayStart(coverageHour); day <= todayStart; day += DAY_MS) {
      const totals = dayTotals.get(day);
      daily.push({
        date: taipeiDate(day), startsAt: iso(day), endsAt: iso(day + DAY_MS),
        firstPublished: totals?.firstPublished ?? 0,
        republishedNotCounted: totals?.republished ?? 0,
        stillPublishedNow: totals?.stillPublished ?? 0,
        ...(day === todayStart ? { partial: true } : {}),
      });
    }
  }

  const rate = (hoursBack: number) => {
    const from = currentHour - hoursBack * HOUR_MS;
    let coveredHours = 0;
    for (let hour = from; hour < currentHour; hour += HOUR_MS) if (covered(hour)) coveredHours += 1;
    const firstPublished = coveredHours ? sum(from, currentHour, first) : null;
    return { from: iso(from), to: iso(currentHour), coveredHours, firstPublished, perHour: firstPublished === null ? null : Math.round(firstPublished / coveredHours * 100) / 100 };
  };
  const last24 = rate(24);

  // With no events at all the log cannot prove a zero, so every count stays null.
  const count = (value: number) => (coverageHour === null ? null : value);
  const yesterdayStart = todayStart - DAY_MS;
  const firstPublishedTotal = sum(-Infinity, Infinity, first);

  return {
    schemaVersion: 1,
    report: 'wishlist-listing-results',
    timeZone: REPORT_TIME_ZONE,
    utcOffset: '+08:00',
    asOf: snapshot.asOf,
    servedAt: iso(servedAt),
    freshness: {
      state: stale ? 'stale' : 'fresh',
      ageSeconds: Math.max(0, Math.round((servedAt - asOf) / 1000)),
      refreshIntervalSeconds: REFRESH_INTERVAL_MS / 1000,
      maxStaleSeconds: MAX_STALE_MS / 1000,
      latestFirstPublishAt: snapshot.latestFirstPublishAt,
      secondsSinceLatestFirstPublish: snapshot.latestFirstPublishAt === null ? null : Math.max(0, Math.round((asOf - Date.parse(snapshot.latestFirstPublishAt)) / 1000)),
    },
    coverage: {
      from: snapshot.coverageStart,
      to: snapshot.asOf,
      retention: 'NO_PURGE',
      retentionNote: '事件紀錄目前沒有任何清除機制，涵蓋範圍從第一筆事件起到現在。',
    },
    successfulListings: {
      kind: 'actual',
      last60Minutes: { from: iso(asOf - HOUR_MS), to: snapshot.asOf, count: count(snapshot.last60Minutes) },
      currentHour: { hourStart: iso(currentHour), count: count(sum(currentHour, currentHour + HOUR_MS, first)), partial: true },
      today: { date: taipeiDate(todayStart), startsAt: iso(todayStart), to: snapshot.asOf, count: count(sum(todayStart, todayStart + DAY_MS, first)), partial: true },
      yesterday: { date: taipeiDate(yesterdayStart), startsAt: iso(yesterdayStart), endsAt: iso(todayStart), count: coverageHour === null || todayStart <= coverageHour ? null : sum(yesterdayStart, todayStart, first) },
      cumulative: { from: snapshot.coverageStart, to: snapshot.asOf, count: count(firstPublishedTotal) },
      republishedNotCounted: count(sum(-Infinity, Infinity, b => b.republished)),
      firstPublishedNotPublishedNow: count(snapshot.firstPublishedNotPublishedNow),
    },
    daily,
    hourly: { requestedHours: hours, from: iso(windowStart), to: iso(currentHour + HOUR_MS), gaps, points },
    measuredRates: {
      kind: 'measured',
      last24CompleteHours: last24,
      last168CompleteHours: rate(168),
    },
    target: targetPerHour === null
      ? { kind: 'target_not_actual', state: 'unavailable', reason: 'TARGET_NOT_PUBLISHED', perHour: null, gapFromLast24hAverage: null }
      : { kind: 'target_not_actual', state: 'available', perHour: targetPerHour, gapFromLast24hAverage: last24.perHour === null ? null : Math.round((last24.perHour - targetPerHour) * 100) / 100 },
    live: {
      kind: 'live_snapshot',
      asOf: snapshot.asOf,
      publiclyVisible: { count: snapshot.publiclyVisible, publicSearchEnabled: snapshot.publicSearchEnabled, ...(snapshot.publiclyVisible === null ? { state: 'unavailable', reason: 'VISIBILITY_CHECK_INCOMPLETE' } : {}) },
      records: snapshot.records,
      waitingToPublish: { count: snapshot.records.privatePending, notUpdatedIn24h: snapshot.privatePendingNotUpdatedIn24h, oldestUpdateAt: snapshot.oldestPrivatePendingUpdateAt },
      processing: unavailable(PIPELINE_STATE_NOT_ON_SERVER),
    },
    pipelineOutcomes: {
      failed: unavailable(ATTEMPTS_NOT_RECORDED),
      skipped: unavailable(PIPELINE_STATE_NOT_ON_SERVER),
      failureReasons: unavailable(ATTEMPTS_NOT_RECORDED),
    },
    estimates: null,
    definitions: DEFINITIONS,
  };
}

export class ListingReportUnavailable extends Error {}

type ProviderOptions = {
  load: () => Promise<ListingSnapshot>;
  clock?: () => number;
  refreshMs?: number;
  maxStaleMs?: number;
  retryMs?: number;
  timeoutMs?: number;
};

// One database refresh per interval no matter how much public traffic arrives;
// query parameters only slice this cached snapshot. A failed refresh serves the
// previous result marked stale, and past maxStaleMs it fails rather than show
// old numbers as current or fall back to zero.
export function createListingReportProvider(options: ProviderOptions) {
  const clock = options.clock ?? Date.now;
  const refreshMs = options.refreshMs ?? REFRESH_INTERVAL_MS;
  const maxStaleMs = options.maxStaleMs ?? MAX_STALE_MS;
  const retryMs = options.retryMs ?? 30_000;
  const timeoutMs = options.timeoutMs ?? 25_000;
  let cached: { snapshot: ListingSnapshot; at: number } | null = null;
  let inflight: Promise<boolean> | null = null;
  let lastFailureAt = -Infinity;

  const refresh = () => {
    inflight ??= (async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const snapshot = await Promise.race([
          Promise.resolve().then(options.load),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('LISTING_REPORT_TIMEOUT')), timeoutMs); }),
        ]);
        cached = { snapshot, at: clock() };
        return true;
      } catch (error) {
        lastFailureAt = clock();
        // Database errors can quote the query; log only a code, never the message.
        console.error('[listing-report] refresh failed', (error as { code?: string })?.code ?? (error as Error)?.name ?? 'UNKNOWN');
        return false;
      } finally {
        clearTimeout(timer);
        inflight = null;
      }
    })();
    return inflight;
  };

  return async (): Promise<{ snapshot: ListingSnapshot; stale: boolean }> => {
    const now = clock();
    if (cached && now - cached.at < refreshMs) return { snapshot: cached.snapshot, stale: false };
    const ok = now - lastFailureAt < retryMs ? false : await refresh();
    if (ok && cached) return { snapshot: cached.snapshot, stale: false };
    if (cached && clock() - cached.at < maxStaleMs) return { snapshot: cached.snapshot, stale: true };
    throw new ListingReportUnavailable('LISTING_REPORT_UNAVAILABLE');
  };
}
