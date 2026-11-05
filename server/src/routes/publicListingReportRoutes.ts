import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { DEFAULT_REPORT_HOURS, MAX_REPORT_HOURS, ListingReportUnavailable, buildListingReport, createListingReportProvider, loadListingSnapshot } from '../lib/publicListingReport';

export const LISTING_REPORT_RATE_LIMIT = 60;
const RETRY_AFTER_SECONDS = 30;

// Publishing the target is Hank's call, so it stays off unless a positive
// integer is configured. Anything else means "not published", never a default.
const configuredTarget = () => {
  const raw = process.env.LISTING_REPORT_TARGET_PER_HOUR;
  return raw !== undefined && /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null;
};

export function createPublicListingReportRoutes(options: {
  provider?: ReturnType<typeof createListingReportProvider>;
  clock?: () => number;
} = {}) {
  const provider = options.provider ?? createListingReportProvider({
    load: () => loadListingSnapshot(prisma, process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1'),
  });
  const clock = options.clock ?? Date.now;
  const router = Router();
  router.use((_req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
  router.use(rateLimit({
    windowMs: 60_000, limit: LISTING_REPORT_RATE_LIMIT, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).set('Cache-Control', 'no-store').json({ errorCode: 'LISTING_REPORT_RATE_LIMIT' }),
  }));
  router.all('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET').json({ errorCode: 'METHOD_NOT_ALLOWED' });
    if (process.env.LISTING_REPORT_DISABLED === '1') return res.status(503).json({ errorCode: 'LISTING_REPORT_DISABLED' });
    const raw = req.query.hours;
    const hours = raw === undefined ? DEFAULT_REPORT_HOURS : typeof raw === 'string' && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
    if (Object.keys(req.query).some(key => key !== 'hours') || hours < 1 || hours > MAX_REPORT_HOURS)
      return res.status(400).json({ errorCode: 'INVALID_QUERY', allowed: { hours: `1-${MAX_REPORT_HOURS}` } });
    try {
      const { snapshot, stale } = await provider();
      if (!stale) res.set('Cache-Control', 'public, max-age=60');
      return res.json(buildListingReport(snapshot, { hours, servedAt: clock(), stale, targetPerHour: configuredTarget() }));
    } catch (error) {
      if (!(error instanceof ListingReportUnavailable)) console.error('[listing-report] build failed', (error as Error)?.name ?? 'UNKNOWN');
      return res.status(503).set('Retry-After', String(RETRY_AFTER_SECONDS)).json({ errorCode: 'LISTING_REPORT_UNAVAILABLE', retryAfterSeconds: RETRY_AFTER_SECONDS });
    }
  });
  return router;
}
