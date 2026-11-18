import { cpCoverageCount } from '../lib/cpCoverage';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { loadDiscoveryPart, eachDiscovery, DiscoveryError, type DiscoveryProduct } from '../lib/discovery';
import { retailBinding, retailIdentity, retailObservation, retailObservationMatches } from '../lib/retailPrices';
import { retailMsrpTable } from '../lib/retailMsrpTable';
import { evaluateCp, attachCp, cpTargets, cpCapacity, CP_BATCH_SIZE } from '../lib/discoveryCp';
export function createRetailPriceAdmin(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const r = Router();
    r.use(marketplaceAdmin(getCredential));
    r.use((_q, s, n) => { s.set('Cache-Control', 'private, no-store'); n(); });
    r.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));
    const fail = (s: any, e: unknown) => s.status(e instanceof DiscoveryError ? e.status : 503).json({ errorCode: e instanceof DiscoveryError ? e.code : 'RETAIL_PRICE_UNAVAILABLE' });
    // Read-only summary of the manufacturer price table, for the pipeline and the monitor.
    r.get('/msrp-table', (_q, s) => s.json({ version: retailMsrpTable.version, verifiedAt: retailMsrpTable.verifiedAt, identities: retailMsrpTable.size, rows: retailMsrpTable.rows, families: retailMsrpTable.identities().reduce<Record<string, number>>((acc, id) => { const f = id.split(':').slice(0, 2).join(':'); acc[f] = (acc[f] ?? 0) + 1; return acc; }, {}) }));
    r.get('/candidates', async (q, s) => { try {
        if (Object.keys(q.query).some(k => !['limit','source','productKey'].includes(k)))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const limit = Number(q.query.limit ?? 3);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const source = String(q.query.source ?? 'all');
        if (!['all','listing','source','external'].includes(source)) throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const productKey = q.query.productKey;
        if (productKey !== undefined && (typeof productKey !== 'string' || !/^(listing|source|external):[a-f0-9-]{36}$/.test(productKey))) throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        // The products a lookup can be asked for: public, AI-allowed, with a price in TWD whose unit is known.
        const priced = (p: DiscoveryProduct) => p.cpAllowed !== false && p.price !== null && p.price > 0 && p.currency === 'TWD' && p.priceUnitVerified && (source === 'all' || p.kind === source);
        type Waiting = { product: DiscoveryProduct; identity: string | null; bindingHash: string; rank: number };
        // An identity with a stated condition first, then any identity, then the oldest.
        const waits = (p: DiscoveryProduct): Waiting => { const identity = retailIdentity(p); return { product: p, identity, bindingHash: retailBinding(p), rank: identity ? ['NEW','USED'].includes(p.condition) ? 2 : 1 : 0 }; };
        const order = (a: Waiting, b: Waiting) => b.rank - a.rank || a.product.date.localeCompare(b.product.date) || a.product.key.localeCompare(b.product.key);
        let waiting: Waiting[] = [], remaining = 0;
        if (productKey) {
            // Direct lookup stays within the same public/AI-allowed catalog and returns its current binding.
            waiting = (await loadDiscoveryPart({ keys: [productKey] })).products.filter(p => p.key === productKey && priced(p)).map(waits);
            remaining = waiting.length;
        }
        // The queue is every such product without a live observation of its current version. Each one is looked at, a
        // batch at a time; only the first `limit` of the order and the count are kept.
        else await eachDiscovery(async batch => {
            // A product the manufacturer price table already answers needs no lookup (retailMsrpTable.ts).
            const open = batch.filter(priced).map(waits).filter(w => !retailMsrpTable.has(w.identity));
            if (!open.length) return;
            const attempts = await prisma.$queryRaw<Array<{ productKey: string; bindingHash: string }>>`
                SELECT DISTINCT a."productKey", a."bindingHash" FROM "RetailPriceObservation" a
                JOIN jsonb_to_recordset(${JSON.stringify(open.map(w => ({ productKey: w.product.key, bindingHash: w.bindingHash })))}::jsonb)
                  AS f("productKey" text, "bindingHash" text)
                  ON a."productKey" = f."productKey" AND a."bindingHash" = f."bindingHash"
                WHERE a."expiresAt" > ${new Date()}
            `;
            const covered = new Set(attempts.map(a => a.productKey + ':' + a.bindingHash)), uncovered = open.filter(w => !covered.has(w.product.key + ':' + w.bindingHash));
            remaining += uncovered.length;
            waiting = [...waiting, ...uncovered].sort(order).slice(0, limit);
        });
        return s.json({ baseline: 'ORIGINAL_NEW_RETAIL', policyVersion: 3, items: waiting.slice(0, limit).map(({ product: p, identity, bindingHash }) => ({ productKey: p.key, title: p.title, description: p.description, price: p.price, currency: p.currency, condition: p.condition, identity, bindingHash, canonicalUrl: p.canonicalUrl })), remaining });
    }
    catch (e) {
        return fail(s, e);
    } });
    // Every product is counted, a batch at a time.
    r.get('/coverage', async (_q, s) => { try { const count = cpCoverageCount(); await eachDiscovery(async batch => count.add(await attachCp(batch))); return s.json(count.report()); } catch (e) { return fail(s,e); } });
    r.get('/capacity', (_q, s) => { try { return s.json(cpCapacity()); } catch (e) { return fail(s,e); } });
    r.get('/evaluations', async (q, s) => { try {
        if (Object.keys(q.query).join(',') !== 'productKeys' || typeof q.query.productKeys !== 'string') throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const keys = q.query.productKeys.split(',');
        if (!keys.length || keys.length > 100 || new Set(keys).size !== keys.length || keys.some(k => !/^(listing|source|external):[a-f0-9-]{36}$/.test(k))) throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const products = await attachCp((await loadDiscoveryPart({ keys })).products.filter(p => keys.includes(p.key) && p.cpAllowed !== false));
        return s.json({ items: products.map(p => ({ productKey: p.key, bindingHash: retailBinding(p), score: p.cp?.score ?? null, evaluatedAt: p.cp?.evaluatedAt ?? null, ready: cpTargets([p], new Set(p.cp ? [p.key] : [])).length > 0 })) });
    } catch (e) { return fail(s, e); } });
    r.get('/pending-evaluations', async (q, s) => { try {
        if (Object.keys(q.query).some(k => k !== 'limit'))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const limit = Number(q.query.limit ?? 6);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        // Only a product with a reference price can be waiting for an evaluation.
        const all = await attachCp((await loadDiscoveryPart({ retail: true })).products);
        return s.json({ items: cpTargets(all, new Set(all.filter(p => p.cp).map(p => p.key)), limit).map(t => ({ productKey: t.product.key, title: t.product.title, originalPrice: t.comparables[0].price })) });
    }
    catch (e) {
        return fail(s, e);
    } });
    r.post('/observations', async (q, s) => { try {
        const body = q.body, key = typeof body?.productKey === 'string' ? body.productKey : '';
        const p = key.length > 0 && key.length <= 60 ? (await loadDiscoveryPart({ keys: [key] })).products.find(p => p.key === key) : undefined;
        if (!p)
            throw new DiscoveryError(404, 'RETAIL_PRODUCT_UNAVAILABLE');
        const data = retailObservation(body, p), old = await prisma.retailPriceObservation.findUnique({ where: { id: data.id } });
        if (old) {
            if (!retailObservationMatches(old.payloadHash, data))
                throw new DiscoveryError(409, 'RETAIL_REQUEST_CONFLICT');
            return s.json({ id: old.id, status: old.status, cached: true });
        }
        const row = await prisma.retailPriceObservation.create({ data });
        return s.status(201).json({ id: row.id, status: row.status, cached: false });
    }
    catch (e) {
        return fail(s, e);
    } });
    // Withdraw a verified price that turned out to be wrong (2026-11-10: catalogue lookups matched a camera body to an
    // accessory). The row stays as history; expiring it removes the reference, the CP built on it, and lets the product
    // become a candidate again. The reason is appended to the notes so the receipt says why.
    r.post('/observations/:id/expire', async (q, s) => { try {
        const id = String(q.params.id ?? '');
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || Object.keys(q.body ?? {}).some(k => k !== 'reason'))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const reason = q.body?.reason;
        if (typeof reason !== 'string' || !reason.trim() || reason.length > 300 || /[<>\u0000-\u001f]/.test(reason))
            throw new DiscoveryError(400, 'RETAIL_INVALID_OBSERVATION');
        const old = await prisma.retailPriceObservation.findUnique({ where: { id } });
        if (!old)
            throw new DiscoveryError(404, 'RETAIL_OBSERVATION_UNAVAILABLE');
        const now = new Date();
        if (old.expiresAt <= now)
            return s.json({ id, status: old.status, expiredAt: old.expiresAt.toISOString(), alreadyExpired: true });
        const row = await prisma.retailPriceObservation.update({ where: { id }, data: { expiresAt: now, notes: [old.notes, `撤回 ${now.toISOString().slice(0, 19)}Z：${reason.trim()}`].filter(Boolean).join('\n').slice(0, 500) } });
        return s.json({ id, status: row.status, expiredAt: row.expiresAt.toISOString(), alreadyExpired: false });
    }
    catch (e) {
        return fail(s, e);
    } });
    r.post('/evaluate', async (q, s) => { try {
        if (Object.keys(q.body ?? {}).join(',') !== 'productKeys' || !Array.isArray(q.body.productKeys) || q.body.productKeys.length < 1 || q.body.productKeys.length > CP_BATCH_SIZE || new Set(q.body.productKeys).size !== q.body.productKeys.length || q.body.productKeys.some((k: unknown) => typeof k !== 'string' || !/^(listing|source|external):[a-f0-9-]{36}$/.test(k)))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        return s.json(await evaluateCp((await loadDiscoveryPart({ keys: q.body.productKeys })).products.filter(p => q.body.productKeys.includes(p.key))));
    }
    catch (e) {
        return fail(s, e);
    } });
    return r;
}
