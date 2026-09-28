import { Router } from 'express';
import fs from 'fs/promises';
import prisma from '../lib/prisma';
import { getClientUrl } from '../config/constants';
import { isDiscoverable, isListingId } from '../lib/listingRules';
import { listingShareSelect, renderListingShareHtml } from '../lib/listingShareMeta';

export function createListingSharePageRoutes(clientIndexPath: string): Router {
    const router = Router();
    router.get('/:id', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const template = await fs.readFile(clientIndexPath, 'utf8');
            if (!isListingId(req.params.id)) return res.status(404).type('html').send(template);
            const listing = await prisma.listing.findUnique({ where: { id: req.params.id }, select: listingShareSelect });
            if (!listing || !isDiscoverable(listing.status, listing.expiresAt, new Date())) {
                return res.status(404).type('html').send(template);
            }
            return res.type('html').send(renderListingShareHtml(template, listing, getClientUrl()));
        } catch (error) {
            console.error('[Listing share] Preview unavailable', error);
            return res.status(503).send('商品預覽暫時無法使用');
        }
    });
    return router;
}
