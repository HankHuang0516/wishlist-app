import { Router } from 'express';
import fs from 'fs/promises';
import { getClientUrl } from '../config/constants';
import { catalogProduct, catalogReady } from '../lib/publicCatalog';
import { productShareMeta, renderShareMetaHtml, sharedWishMeta } from '../lib/shareMeta';
import { readSharedWish } from '../lib/wishShare';

const productId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The pages people share — a public-source or partner product, and a wish its owner shared — answer with their own
 *  name, price and picture in the first HTML, for the preview an app draws of the address. Whatever cannot be
 *  described in time (not public any more, the catalogue not ready, any failure) goes on to the ordinary page, which
 *  says so itself. A listing's page is answered by listingSharePageRoutes. */
export function createSharePageRoutes(clientIndexPath: string): Router {
    const router = Router();
    router.get('/products/:kind/:id', async (req, res, next) => {
        try {
            const { kind, id } = req.params;
            if (!productId.test(id)) return next();
            if (kind === 'listing') return res.redirect(302, '/listings/' + id.toLowerCase());
            if (kind !== 'source' && kind !== 'external') return next();
            const now = new Date(), product = await catalogReady(now) ? await catalogProduct(kind + ':' + id.toLowerCase(), now, true) : null;
            if (!product) return next();
            const html = renderShareMetaHtml(await fs.readFile(clientIndexPath, 'utf8'), productShareMeta(product, getClientUrl()));
            res.setHeader('Cache-Control', 'no-store');
            return res.type('html').send(html);
        } catch { return next(); }
    });
    router.get('/shared-wishes/:token', async (req, res, next) => {
        try {
            const wish = await readSharedWish(req.params.token);
            if (!wish) return next();
            const html = renderShareMetaHtml(await fs.readFile(clientIndexPath, 'utf8'), sharedWishMeta(wish, req.params.token, getClientUrl()));
            res.setHeader('Cache-Control', 'no-store');
            // The address is the key to the wish: it is never sent on to another site as a referrer.
            res.setHeader('Referrer-Policy', 'no-referrer');
            return res.type('html').send(html);
        } catch { return next(); }
    });
    return router;
}
