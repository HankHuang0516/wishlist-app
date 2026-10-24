import { Router } from 'express';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { listingCreationGate, ListingCreationError } from '../lib/listingCreation';
import { isListingId, NON_SALE_QA_PREFIX } from '../lib/listingRules';
import { leadCurrent, leadDTO } from '../lib/sourceLeadRules';
import { getClientUrl } from '../config/constants';
import { externalCandidateSelect, publicCandidate } from './externalListingRoutes';

class WishError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const receiptSelect = { clientRequestId: true, productKey: true, itemId: true, wishlistId: true } as const;
const kinds = ['listing', 'source', 'external'] as const;
const validId = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
export function productWishInput(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new WishError(400, 'INVALID_PRODUCT_WISH');
  const b = v as Record<string, unknown>;
  if (Object.keys(b).sort().join(',') !== 'clientRequestId,kind,productId,wishlistId' || !isListingId(b.clientRequestId) ||
    !isListingId(b.productId) || !kinds.includes(b.kind as any) || !validId(b.wishlistId)) throw new WishError(400, 'INVALID_PRODUCT_WISH');
  const kind = b.kind as typeof kinds[number], productId = (b.productId as string).toLowerCase(), wishlistId = b.wishlistId as number;
  return { kind, productId, wishlistId, clientRequestId: (b.clientRequestId as string).toLowerCase(), productKey: kind + ':' + productId,
    requestHash: createHash('sha256').update(JSON.stringify([kind, productId, wishlistId])).digest('hex') };
}
async function snapshot(tx: Prisma.TransactionClient, kind: typeof kinds[number], id: string) {
  if (kind === 'listing') {
    const p = await tx.listing.findFirst({ where: { id, status: { in: ['ACTIVE', 'RESERVED'] }, expiresAt: { gt: new Date() },
      NOT: { title: { startsWith: NON_SALE_QA_PREFIX } } }, select: { title: true, price: true, media: {
      where: { OR: [{ capturePurpose: { not: 'AI_MARKETING' } }, { marketingSelected: true }] }, orderBy: { position: 'asc' },
      select: { thumbnailUrl: true }, take: 1 } } });
    if (!p) throw new WishError(404, 'PRODUCT_UNAVAILABLE');
    return { name: p.title, price: p.price?.toString() ?? null, imageUrl: p.media[0]?.thumbnailUrl ?? null,
      link: getClientUrl().replace(/\/$/, '') + '/listings/' + id, notes: '來自站內刊登；商品狀況與交易條件仍以賣家確認為準。' };
  }
  if (kind === 'external') {
    if (process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED !== '1') throw new WishError(404, 'PRODUCT_UNAVAILABLE');
    const raw = await tx.externalListingCandidate.findUnique({ where: { id }, select: externalCandidateSelect });
    const p = raw ? publicCandidate(raw, new Date()) : null;
    if (!p) throw new WishError(404, 'PRODUCT_UNAVAILABLE');
    return { name: p.title, price: p.priceTwd ?? null, imageUrl: p.thumbnailUrl ?? null, link: p.canonicalUrl,
      notes: '外部來源參考，庫存與交易條件待確認。' };
  }
  if (process.env.SOURCE_LEADS_PUBLIC_ENABLED !== '1') throw new WishError(404, 'PRODUCT_UNAVAILABLE');
  const p = await tx.externalSourceLead.findUnique({ where: { id } });
  if (!p || !leadCurrent(p)) throw new WishError(404, 'PRODUCT_UNAVAILABLE');
  const dto = leadDTO(p, true, true);
  return { name: p.title, price: null, imageUrl: dto.media?.[0]?.thumbnailUrl ?? null, link: p.canonicalUrl,
    notes: ('外部來源參考，庫存與交易條件待確認。\n' + (dto.publicFacts?.priceText ?? '')).slice(0, 1000) };
}
export function createProductWishRoutes() {
  const router = Router();
  router.use(authenticateToken);
  router.use((_q, r, n) => { r.set('Cache-Control', 'private, no-store'); n(); });
  router.get('/', async (req: AuthRequest, res) => {
    try {
      if (Object.keys(req.query).length) throw new WishError(400, 'INVALID_PRODUCT_WISH');
      const userId = req.user!.id;
      const [lists, links] = await Promise.all([
        prisma.wishlist.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, isPublic: true, maxItems: true, _count: { select: { items: true } } } }),
        prisma.productWishLink.findMany({ where: { userId, item: { is: { wishlist: { userId } } } }, select: { productKey: true, itemId: true, item: { select: { wishlistId: true } } } })
      ]);
      return res.json({ lists: lists.map(l => ({ id: l.id, title: l.title, isPublic: l.isPublic, remaining: Math.max(0, l.maxItems - l._count.items) })),
        saved: links.map(l => ({ productKey: l.productKey, itemId: l.itemId, wishlistId: l.item!.wishlistId })) });
    } catch { return res.status(503).json({ errorCode: 'PRODUCT_WISH_READ_UNAVAILABLE' }); }
  });
  router.get('/receipts/:id', async (req: AuthRequest, res) => {
    try {
      if (!isListingId(req.params.id) || Object.keys(req.query).length) return res.sendStatus(400);
      const row = await prisma.productWishReceipt.findUnique({ where: { userId_clientRequestId: { userId: req.user!.id, clientRequestId: String(req.params.id).toLowerCase() } }, select: receiptSelect });
      if (!row) return res.sendStatus(404);
      return res.json({ ...row, deleted: row.itemId === null });
    } catch { return res.status(503).json({ errorCode: 'PRODUCT_WISH_READ_UNAVAILABLE' }); }
  });
  router.post('/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }), async (req: AuthRequest, res) => {
    try {
      if (Object.keys(req.query).length) throw new WishError(400, 'INVALID_PRODUCT_WISH');
      const input = productWishInput(req.body), userId = req.user!.id;
      const result = await prisma.$transaction(async tx => {
        await listingCreationGate(tx, req, userId);
        const prior = await tx.productWishReceipt.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
        if (prior) {
          if (prior.requestHash !== input.requestHash) throw new WishError(409, 'PRODUCT_WISH_REQUEST_CONFLICT');
          return { clientRequestId: prior.clientRequestId, productKey: prior.productKey, wishlistId: prior.wishlistId, itemId: prior.itemId, deleted: prior.itemId === null };
        }
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Wishlist" WHERE "id" = ${input.wishlistId} FOR UPDATE`);
        const list = await tx.wishlist.findUnique({ where: { id: input.wishlistId }, select: { userId: true, maxItems: true } });
        if (!list || list.userId !== userId) throw new WishError(404, 'WISHLIST_UNAVAILABLE');
        const existing = await tx.productWishLink.findUnique({ where: { userId_productKey: { userId, productKey: input.productKey } }, include: { item: { select: { id: true, wishlistId: true, wishlist: { select: { userId: true } } } } } });
        let itemId: number, wishlistId: number;
        if (existing?.item?.wishlist.userId === userId) { itemId = existing.item.id; wishlistId = existing.item.wishlistId; }
        else {
          if (await tx.item.count({ where: { wishlistId: input.wishlistId } }) >= list.maxItems) throw new WishError(409, 'WISHLIST_FULL');
          const data = await snapshot(tx, input.kind, input.productId);
          const item = await tx.item.create({ data: { ...data, wishlistId: input.wishlistId, currency: 'TWD', aiStatus: 'SKIPPED', uploadStatus: 'COMPLETED' } });
          itemId = item.id; wishlistId = input.wishlistId;
          await tx.productWishLink.upsert({ where: { userId_productKey: { userId, productKey: input.productKey } }, create: { userId, productKey: input.productKey, itemId }, update: { itemId } });
          await tx.wishlist.update({ where: { id: wishlistId }, data: { updatedAt: new Date() } });
        }
        await tx.productWishReceipt.create({ data: { userId, clientRequestId: input.clientRequestId, requestHash: input.requestHash, productKey: input.productKey, wishlistId, itemId } });
        return { clientRequestId: input.clientRequestId, productKey: input.productKey, itemId, wishlistId, deleted: false };
      });
      return res.status(201).json(result);
    } catch (e) {
      const status = e instanceof WishError || e instanceof ListingCreationError ? e.status : 503;
      return res.status(status).json({ errorCode: e instanceof WishError ? e.code : 'PRODUCT_WISH_UNAVAILABLE' });
    }
  });
  return router;
}
