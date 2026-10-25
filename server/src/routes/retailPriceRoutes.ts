import { cpCoverage } from '../lib/cpCoverage';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { loadDiscovery, DiscoveryError } from '../lib/discovery';
import { retailBinding, retailIdentity, retailObservation } from '../lib/retailPrices';
import { evaluateCp, attachCp, cpTargets } from '../lib/discoveryCp';
export function createRetailPriceAdmin(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const r = Router();
    r.use(marketplaceAdmin(getCredential));
    r.use((_q, s, n) => { s.set('Cache-Control', 'private, no-store'); n(); });
    r.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));
    const fail = (s: any, e: unknown) => s.status(e instanceof DiscoveryError ? e.status : 503).json({ errorCode: e instanceof DiscoveryError ? e.code : 'RETAIL_PRICE_UNAVAILABLE' });
    r.get('/candidates', async (q, s) => { try {
        if (Object.keys(q.query).some(k => !['limit','source','productKey'].includes(k)))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const limit = Number(q.query.limit ?? 3);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20)
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const source = String(q.query.source ?? 'all');
        if (!['all','listing','source','external'].includes(source)) throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const productKey = q.query.productKey;
        if (productKey !== undefined && (typeof productKey !== 'string' || !/^(listing|source|external):[a-f0-9-]{36}$/.test(productKey))) throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const all = (await loadDiscovery()).filter(p => p.cpAllowed !== false && p.price !== null && p.price > 0 && p.currency === 'TWD' && p.priceUnitVerified);
        const attempts = await prisma.retailPriceObservation.findMany({ where: { expiresAt: { gt: new Date() } }, select: { productKey: true, bindingHash: true }, take: 10000 });
        const covered = new Set(attempts.map(a => a.productKey + ':' + a.bindingHash));
        // Direct lookup stays within the same public/AI-allowed catalog and returns its current binding.
        const waiting = all.filter(p => (source === 'all' || p.kind === source) && (productKey ? p.key === productKey : !covered.has(p.key + ':' + retailBinding(p)))).sort((a, b) => Number(!!retailIdentity(b) && ['NEW','USED'].includes(b.condition)) - Number(!!retailIdentity(a) && ['NEW','USED'].includes(a.condition)) || Number(!!retailIdentity(b)) - Number(!!retailIdentity(a)) || a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
        return s.json({ baseline: 'ORIGINAL_NEW_RETAIL', policyVersion: 3, items: waiting.slice(0, limit).map(p => ({ productKey: p.key, title: p.title, description: p.description, price: p.price, currency: p.currency, condition: p.condition, identity: retailIdentity(p), bindingHash: retailBinding(p), canonicalUrl: p.canonicalUrl })), remaining: waiting.length });
    }
    catch (e) {
        return fail(s, e);
    } });
    r.get('/coverage', async (_q, s) => { try { return s.json(cpCoverage(await attachCp(await loadDiscovery()))); } catch (e) { return fail(s,e); } });
    r.get('/pending-evaluations', async (q, s) => { try {
        if (Object.keys(q.query).some(k => k !== 'limit'))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const limit = Number(q.query.limit ?? 6);
        if (!Number.isInteger(limit) || limit < 1 || limit > 6)
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        const all = await attachCp(await loadDiscovery());
        return s.json({ items: cpTargets(all, new Set(all.filter(p => p.cp).map(p => p.key))).slice(0, limit).map(t => ({ productKey: t.product.key, title: t.product.title, originalPrice: t.comparables[0].price })) });
    }
    catch (e) {
        return fail(s, e);
    } });
    r.post('/observations', async (q, s) => { try {
        const body = q.body, p = (await loadDiscovery()).find(p => p.key === body?.productKey);
        if (!p)
            throw new DiscoveryError(404, 'RETAIL_PRODUCT_UNAVAILABLE');
        const data = retailObservation(body, p), old = await prisma.retailPriceObservation.findUnique({ where: { id: data.id } });
        if (old) {
            if (old.payloadHash !== data.payloadHash)
                throw new DiscoveryError(409, 'RETAIL_REQUEST_CONFLICT');
            return s.json({ id: old.id, status: old.status, cached: true });
        }
        const row = await prisma.retailPriceObservation.create({ data });
        return s.status(201).json({ id: row.id, status: row.status, cached: false });
    }
    catch (e) {
        return fail(s, e);
    } });
    r.post('/evaluate', async (q, s) => { try {
        if (Object.keys(q.body ?? {}).join(',') !== 'productKeys' || !Array.isArray(q.body.productKeys) || q.body.productKeys.length < 1 || q.body.productKeys.length > 6 || q.body.productKeys.some((k: unknown) => typeof k !== 'string' || !/^(listing|source|external):[a-f0-9-]{36}$/.test(k)))
            throw new DiscoveryError(400, 'RETAIL_INVALID_QUERY');
        return s.json(await evaluateCp((await loadDiscovery()).filter(p => q.body.productKeys.includes(p.key))));
    }
    catch (e) {
        return fail(s, e);
    } });
    return r;
}
