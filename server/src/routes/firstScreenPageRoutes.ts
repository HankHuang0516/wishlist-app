import { Router } from 'express';
import fs from 'fs/promises';
import { exploreHints, renderFirstScreenHints, sourceLeadHints, type FirstScreenHints } from '../lib/firstScreenHints';

type Hinter = () => Promise<FirstScreenHints | null>;
export const defaultHinters: Record<string, Hinter> = { '/explore': () => exploreHints(), '/source-leads': () => sourceLeadHints() };

/** Waits for `work` up to `ms`, then gives up on it (it still finishes, and may fill a cache for the next visitor). */
function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ms);
        work.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(null); });
    });
}

/** The pages whose HTML names what their first screen shows (lib/firstScreenHints.ts). Only the plain address is
 *  answered here; any query, a HEAD request, no hints in time or any failure goes on to the ordinary page. */
export function createFirstScreenPageRoutes(clientIndexPath: string, hinters: Record<string, Hinter> = defaultHinters, deadlineMs = 150): Router {
    const router = Router();
    for (const [path, hinter] of Object.entries(hinters)) router.get(path, async (req, res, next) => {
        if (req.method !== 'GET' || Object.keys(req.query).length) return next();
        try {
            const [template, hints] = await Promise.all([fs.readFile(clientIndexPath, 'utf8'), within(hinter(), deadlineMs)]);
            const html = hints && renderFirstScreenHints(template, hints);
            if (!html) return next();
            // The hints describe this moment; the page itself is the same index.html as everywhere else.
            res.setHeader('Cache-Control', 'no-store');
            return res.type('html').send(html);
        } catch { return next(); }
    });
    return router;
}
