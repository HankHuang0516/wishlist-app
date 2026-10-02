import { privateContactField } from '../lib/listingPolicy';
import { sourceLeadMedia, sourceLeadMediaDTO } from '../lib/sourceLeadMedia';
import { ListingFlickrStorage } from '../lib/listingFlickrStorage';
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { marketplaceAdmin } from '../middleware/marketplaceAdmin';
import { isListingId } from '../lib/listingRules';
import { LeadError, object, exact, parseLead, leadCurrent, leadDTO, digest, transferSnapshot, routeCurrent, contactRoutingDTO, publicUrl, ref, date, LeadEvent } from '../lib/sourceLeadRules';
const enabled = () => process.env.SOURCE_LEADS_PUBLIC_ENABLED === '1';
const fail = (res: Response, e: unknown) => res.status(e instanceof LeadError ? 409 : 503).json({ errorCode: e instanceof LeadError ? e.message : 'SOURCE_LEAD_UNAVAILABLE' });
// Preserve seller identity across renewed route checks without rewriting the original send receipt.
const sellerBindingHash=(value:unknown)=>{const r=object(value);return digest(Object.fromEntries(['leadId','contentHash','sourceUrl','channel','publicRouteUrl','identityEvidenceRef'].map(k=>[k,r[k]])));};
const dto = (r: any, l: any, presentation = false) => ({ id: r.id, leadId: r.leadId, state: r.state, available: enabled() && leadCurrent(l) && r.leadContentHash === l.contentHash, events: (r.events as LeadEvent[]).filter(e => presentation || e.action !== 'SELLER_REPLY').map(({ requestId, action, text, at }) => ({ requestId, action, text, at })), transferHash: digest(transferSnapshot(l, r.events as LeadEvent[])), routeVerified: routeCurrent(l), delivered: !!r.delivery?.receipt, delivery: r.delivery?.receipt ? { at: r.delivery.receipt.sentAt, channel: r.delivery.receipt.channel, verification: 'MANUAL_UI_RECEIPT' } : null, checkoutEnabled: false, orderCreated: false, notice: 'Agent 只協助收件；未核原賣家路由前不發送，不代表在售或成交。' });
export function createSourceLeadAdmin(getCredential: () => unknown = () => process.env.ADMIN_API_KEY) {
    const router = Router();
    router.use(marketplaceAdmin(getCredential));
    router.use((_q, r, n) => { r.set('Cache-Control', 'private, no-store'); n(); });
    router.use(rateLimit({ windowMs: 60000, limit: 30 }));
    router.post('/import', async (req, res) => {
        try {
            const b = object(req.body);
            exact(b, ['items', 'dryRun']);
            if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20 || typeof b.dryRun !== 'boolean')
                throw new LeadError('ONE_TO_20_LEADS_REQUIRED');
            const rows = b.items.map((r: any) => parseLead(r));
            if (new Set(rows.map((r: any) => r.archiveItemId)).size !== rows.length)
                throw new LeadError('DUPLICATE_ARCHIVE_ID');
            const result = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(73009260930::bigint)`;
                for (const row of rows) {
                    const old = await tx.externalSourceLead.findUnique({ where: { archiveItemId: row.archiveItemId } });
                    if (old && (old.libraryFileId !== row.libraryFileId || old.canonicalUrl !== row.canonicalUrl || old.archiveVersion > row.archiveVersion || old.status === 'WITHDRAWN' || (old.archiveVersion === row.archiveVersion && (old.archiveSha256 !== row.archiveSha256 || old.contentHash !== row.contentHash))))
                        throw new LeadError('STALE_OR_CONFLICTING_LEAD');
                }
                if (b.dryRun)
                    return { validatedCount: rows.length, persistedCount: 0 };
                const ids = [];
                for (const row of rows) {
                    const old = await tx.externalSourceLead.findUnique({ where: { archiveItemId: row.archiveItemId } });
                    const r = await tx.externalSourceLead.upsert({ where: { archiveItemId: row.archiveItemId }, create: row, update: { ...row, ...(old?.contentHash !== row.contentHash ? { sellerRoute: Prisma.DbNull } : {}) } });
                    ids.push(r.id);
                }
                return { validatedCount: rows.length, persistedCount: rows.length, ids };
            });
            return res.json({ ...result, qualifiedSupplyCount: 0 });
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.post('/:id/withdraw', async (req, res) => { try {
        if (!isListingId(req.params.id))
            throw new LeadError('INVALID_LEAD');
        const b = object(req.body);
        exact(b, ['reasonRef']);
        if (!ref(b.reasonRef))
            throw new LeadError('REASON_REQUIRED');
        await prisma.$transaction(async (tx) => { await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${req.params.id} FOR UPDATE`; const row = await tx.externalSourceLead.findUniqueOrThrow({ where: { id: String(req.params.id) } }); await tx.externalSourceLead.update({ where: { id: row.id }, data: { status: 'WITHDRAWN', evidence: { ...object(row.evidence), withdrawalRef: b.reasonRef } } }); });
        return res.json({ withdrawn: true });
    }
    catch (e) {
        return fail(res, e);
    } });
    router.post('/:id/seller-route', async (req, res) => {
        try {
            const b = object(req.body);
            exact(b, ['leadId', 'contentHash', 'sourceUrl', 'channel', 'publicRouteUrl', 'identityEvidenceRef', 'routeEvidenceRef', 'confirmOriginalSeller']);
            if (!isListingId(req.params.id) || b.leadId !== req.params.id || b.confirmOriginalSeller !== true || !['FACEBOOK_UI', 'ECLAW', 'EMAIL'].includes(b.channel) || !ref(b.identityEvidenceRef) || !ref(b.routeEvidenceRef))
                throw new LeadError('VERIFIED_ORIGINAL_SELLER_REQUIRED');
            const url = publicUrl(b.publicRouteUrl), host = new URL(url).hostname;
            if (b.channel === 'FACEBOOK_UI' && (!['www.facebook.com', 'm.me'].includes(host) || new URL(url).pathname.startsWith('/groups/')))
                throw new LeadError('GROUP_AUTHOR_IS_NOT_MESSAGING_ROUTE');
            if (b.channel === 'ECLAW' && host !== 'eclawbot.com')
                throw new LeadError('INVALID_ECLAW_ROUTE');
            await prisma.$transaction(async (tx) => { await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${req.params.id} FOR UPDATE`; const l = await tx.externalSourceLead.findUniqueOrThrow({ where: { id: String(req.params.id) } }); if (!leadCurrent(l) || b.contentHash !== l.contentHash || b.sourceUrl !== l.canonicalUrl)
                throw new LeadError('LEAD_BINDING_MISMATCH'); await tx.externalSourceLead.update({ where: { id: l.id }, data: { sellerRoute: { leadId: l.id, contentHash: l.contentHash, sourceUrl: l.canonicalUrl, channel: b.channel, publicRouteUrl: url, identityEvidenceRef: b.identityEvidenceRef, routeEvidenceRef: b.routeEvidenceRef, verifiedAt: new Date().toISOString() } } }); });
            return res.json({ verified: true, outboundSent: false });
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.post('/:id/seller-route-review',async(req,res)=>{try{
        const b=object(req.body);exact(b,['leadId','sourceUrl','contentHash','status','identityEvidenceRef','routeEvidenceRef','reason','checkedAt']);
        const checked=date(b.checkedAt);
        if(!isListingId(req.params.id)||b.leadId!==req.params.id||!['UNAVAILABLE','UNVERIFIED'].includes(b.status)||!ref(b.identityEvidenceRef)||!ref(b.routeEvidenceRef)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>240||privateContactField({title:b.reason})||/[\u0000-\u001f\u007f]/.test(b.reason)||checked>new Date()||Date.now()-checked.getTime()>48*3600000)throw new LeadError('BOUND_ROUTE_REVIEW_REQUIRED');
        const result=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT id FROM "ExternalSourceLead" WHERE id=${req.params.id} FOR UPDATE`;const lead=await tx.externalSourceLead.findUniqueOrThrow({where:{id:String(req.params.id)}});
            if(lead.canonicalUrl!==b.sourceUrl||lead.contentHash!==b.contentHash)throw new LeadError('LEAD_BINDING_MISMATCH');
            const next=await tx.externalSourceLead.update({where:{id:lead.id},data:{sellerRoute:{...b,checkedAt:checked.toISOString()}}});return {contactRouting:contactRoutingDTO(next),routeVerified:false,outboundSent:false};
        });return res.json(result);
    }catch(e){return fail(res,e);}});
    router.get('/inquiries', async (req, res) => { try {
        if (Object.keys(req.query).some(k => !['cursor'].includes(k)) || (req.query.cursor && !isListingId(req.query.cursor)))
            throw new LeadError('INVALID_CURSOR');
        const rows = await prisma.sourceLeadInquiry.findMany({ include:{lead:true}, orderBy: { id: 'asc' }, take: 26, ...(req.query.cursor ? { cursor: { id: String(req.query.cursor) }, skip: 1 } : {}) });
        return res.json({ items: rows.slice(0, 25).map(({lead,...room})=>({...room,source:{id:lead.id,archiveItemId:lead.archiveItemId,canonicalUrl:lead.canonicalUrl,title:lead.title,contactRouting:contactRoutingDTO(lead),contentHash:lead.contentHash,sellerRoute:lead.sellerRoute}})), nextCursor: rows.length > 25 ? rows[24].id : null });
    }
    catch (e) {
        return fail(res, e);
    } });
    router.post('/inquiries/:id/prepare-transfer', async (req, res) => {
        try {
            const b = object(req.body);
            exact(b, ['requestId']);
            if (!enabled() || !isListingId(req.params.id) || !isListingId(b.requestId))
                throw new LeadError('TRANSFER_DISABLED_OR_INVALID');
            const result = await prisma.$transaction(async (tx) => {
                const first = await tx.sourceLeadInquiry.findUniqueOrThrow({ where: { id: String(req.params.id) } });
                await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${first.leadId} FOR UPDATE`;
                await tx.$executeRaw `SELECT id FROM "SourceLeadInquiry" WHERE id=${first.id} FOR UPDATE`;
                const r = await tx.sourceLeadInquiry.findUniqueOrThrow({ where: { id: first.id }, include: { lead: true } });
                if ((r.events as unknown as LeadEvent[]).filter(e=>e.action==='ASK').some(e=>privateContactField({title:e.text??''}))) throw new LeadError('PRIVATE_CONTACT_NOT_FORWARDED');
                const snapshot = transferSnapshot(r.lead, r.events as unknown as LeadEvent[]), payloadHash = digest(snapshot), prior = r.delivery ? object(r.delivery) : null;
                if (prior) {
                    if (prior.reservation?.id !== b.requestId || r.state !== 'TRANSFER_RESERVED')
                        throw new LeadError('TRANSFER_ALREADY_RESERVED_OR_CLOSED');
                    return { reservation: prior.reservation, snapshot, route: r.lead.sellerRoute, outboundSent: false };
                }
                if (r.state !== 'WAITING_ROUTE' || r.consentHash !== payloadHash || r.leadContentHash !== r.lead.contentHash || !leadCurrent(r.lead) || !routeCurrent(r.lead))
                    throw new LeadError('CURRENT_CONSENT_AND_ROUTE_REQUIRED');
                const reservation = { id: b.requestId, leadId: r.leadId, sourceUrl: r.lead.canonicalUrl, payloadHash, routeHash: digest(r.lead.sellerRoute), channel: object(r.lead.sellerRoute).channel, sellerBindingHash:sellerBindingHash(r.lead.sellerRoute), preparedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120000).toISOString() };
                await tx.sourceLeadInquiry.update({ where: { id: r.id }, data: { state: 'TRANSFER_RESERVED', delivery: { reservation } } });
                return { reservation, snapshot, route: r.lead.sellerRoute, outboundSent: false };
            });
            return res.json(result);
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.get('/inquiries/:id/transfer-preflight', async (req, res) => {
        try {
            if (!enabled() || !isListingId(req.params.id))
                throw new LeadError('TRANSFER_DISABLED');
            const r = await prisma.sourceLeadInquiry.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: { lead: true } }), saved = r.delivery ? object(r.delivery) : {}, v = saved.reservation;
            if (r.state !== 'TRANSFER_RESERVED' || !v || Date.parse(v.expiresAt) <= Date.now() || !leadCurrent(r.lead) || !routeCurrent(r.lead) || r.consentHash !== v.payloadHash || r.consentHash !== digest(transferSnapshot(r.lead, r.events as unknown as LeadEvent[])) || v.routeHash !== digest(r.lead.sellerRoute))
                throw new LeadError('TRANSFER_STOP_REQUIRED');
            return res.json({ reservation: v, snapshot: transferSnapshot(r.lead, r.events as unknown as LeadEvent[]), route: r.lead.sellerRoute, preflightAt: new Date().toISOString(), outboundSent: false, notice: 'Immediately recheck before the normal UI send; cancellation and external UI cannot be atomic. If uncertain stop, never retry send.' });
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.post('/inquiries/:id/delivery', async (req, res) => {
        try {
            const b = object(req.body);
            exact(b, ['requestId', 'reservationId', 'payloadHash', 'routeHash', 'leadId', 'sourceUrl', 'channel', 'receiptRef', 'sentAt', 'outcome']);
            if (!isListingId(req.params.id) || !isListingId(b.requestId) || !isListingId(b.reservationId) || !ref(b.receiptRef) || b.outcome !== 'CONFIRMED_SENT')
                throw new LeadError('CONFIRMED_UI_RECEIPT_REQUIRED');
            const sentAt = date(b.sentAt);
            if (sentAt > new Date() || Date.now() - sentAt.getTime() > 24 * 3600000)
                throw new LeadError('RECENT_UI_RECEIPT_REQUIRED');
            const result = await prisma.$transaction(async (tx) => {
                const first = await tx.sourceLeadInquiry.findUniqueOrThrow({ where: { id: String(req.params.id) } });
                await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${first.leadId} FOR UPDATE`;
                await tx.$executeRaw `SELECT id FROM "SourceLeadInquiry" WHERE id=${first.id} FOR UPDATE`;
                const r = await tx.sourceLeadInquiry.findUniqueOrThrow({ where: { id: first.id }, include: { lead: true } }), saved = r.delivery ? object(r.delivery) : {}, v = saved.reservation;
                if (saved.receipt) {
                    if (digest(saved.receipt) !== digest(b))
                        throw new LeadError('DELIVERY_ALREADY_RECORDED');
                    return dto(r, r.lead);
                }
                if (!v || !['TRANSFER_RESERVED', 'CANCEL_REQUESTED'].includes(r.state) || b.reservationId !== v.id || b.payloadHash !== v.payloadHash || b.leadId !== v.leadId || b.sourceUrl !== v.sourceUrl || b.routeHash !== v.routeHash || b.channel !== v.channel || sentAt < date(v.preparedAt))
                    throw new LeadError('DELIVERY_BINDING_MISMATCH');
                // Record actual confirmed receipt even after cancellation/withdrawal or a
                // kill switch. This is truthful audit, not permission for a new UI send.
                const afterCancel = saved.cancelRequestedAt && sentAt >= date(saved.cancelRequestedAt), outsideWindow = sentAt > date(v.expiresAt), contextChanged = !enabled() || !leadCurrent(r.lead) || r.leadContentHash !== r.lead.contentHash || !routeCurrent(r.lead) || v.routeHash !== digest(r.lead.sellerRoute);
                const reviewRequired = !!afterCancel || outsideWindow || contextChanged;
                const next = await tx.sourceLeadInquiry.update({ where: { id: r.id }, data: { state: reviewRequired ? 'DELIVERY_REQUIRES_REVIEW' : 'DELIVERED', delivery: { ...saved, receipt: b, reviewRequired, principal: 'EXISTING_ADMIN_MANUAL_UI' } } });
                return dto(next, r.lead);
            });
            return res.json(result);
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.post('/inquiries/:id/seller-reply', async (req,res)=>{try{
        const b=object(req.body); exact(b,['requestId','leadId','sourceUrl','routeHash','reservationId','text','receiptRef','receivedAt']);
        if (!isListingId(req.params.id)||!isListingId(b.requestId)||!isListingId(b.leadId)||!isListingId(b.reservationId)||!ref(b.receiptRef)||typeof b.text!=='string'||!b.text.trim()||b.text.length>1500||privateContactField({title:b.text})||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(b.text)) throw new LeadError('BOUND_SAFE_SELLER_REPLY_REQUIRED');
        const at=date(b.receivedAt); if(at>new Date()||Date.now()-at.getTime()>48*3600000)throw new LeadError('RECENT_REPLY_REQUIRED');
        const result=await prisma.$transaction(async tx=>{
            const first=await tx.sourceLeadInquiry.findUniqueOrThrow({where:{id:String(req.params.id)}});
            await tx.$executeRaw`SELECT id FROM "ExternalSourceLead" WHERE id=${first.leadId} FOR UPDATE`;
            await tx.$executeRaw`SELECT id FROM "SourceLeadInquiry" WHERE id=${first.id} FOR UPDATE`;
            const r=await tx.sourceLeadInquiry.findUniqueOrThrow({where:{id:first.id},include:{lead:true}}),events=r.events as unknown as LeadEvent[];
            const old=events.find(e=>e.requestId===b.requestId),boundHash=digest(b);
            if(old){if(old.action!=='SELLER_REPLY'||old.payloadHash!==boundHash)throw new LeadError('REQUEST_CONFLICT');return dto(r,r.lead,true);}
            const delivery=object(r.delivery),receipt=delivery.receipt;
            const sameSeller=delivery.reservation?.sellerBindingHash?delivery.reservation.sellerBindingHash===sellerBindingHash(r.lead.sellerRoute):digest(r.lead.sellerRoute)===b.routeHash;
            if(r.leadId!==b.leadId||r.lead.canonicalUrl!==b.sourceUrl||!receipt||receipt.leadId!==b.leadId||receipt.sourceUrl!==b.sourceUrl||receipt.reservationId!==b.reservationId||receipt.routeHash!==b.routeHash||!routeCurrent(r.lead)||!sameSeller||at<date(receipt.sentAt)||r.state!=='DELIVERED')throw new LeadError('VERIFIED_REPLY_BINDING_REQUIRED');
            if(events.length>=200)throw new LeadError('INQUIRY_LIMIT');
            const saved=await tx.sourceLeadInquiry.update({where:{id:r.id},data:{events:[...events,{requestId:b.requestId,action:'SELLER_REPLY',text:b.text,at:at.toISOString(),payloadHash:boundHash,receiptRef:b.receiptRef}] as unknown as Prisma.InputJsonValue}});
            return dto(saved,r.lead,true);
        });return res.json(result);
    }catch(e){return fail(res,e);}});
    return router;
}
export function createSourceLeadRoutes() {
    const router = Router();
    router.use(rateLimit({ windowMs: 60000, limit: 120 }));
    router.use((_q, r, n) => { r.set('Cache-Control', 'no-store'); n(); });
    router.get('/', async (req, res) => {
        try {
            if (!enabled())
                return res.json({ items: [], nextCursor: null, enabled: false });
            if (Object.keys(req.query).some(k => !['q', 'bbox', 'cursor', 'presentation'].includes(k)))
                throw new LeadError('INVALID_QUERY');
            if (req.query.presentation !== undefined && req.query.presentation !== '1') throw new LeadError('INVALID_PRESENTATION');
            const q = String(req.query.q ?? '');
            if (q.length > 80)
                throw new LeadError('INVALID_QUERY');
            const cursor = req.query.cursor ? String(req.query.cursor) : null;
            if (cursor && !isListingId(cursor))
                throw new LeadError('INVALID_CURSOR');
            let box: number[] | null = null;
            if (req.query.bbox) {
                box = String(req.query.bbox).split(',').map(Number);
                if (box.length !== 4 || box.some(v => !Number.isFinite(v)) || box[0] < 117 || box[2] > 123.8 || box[1] < 20 || box[3] > 26.6 || box[0] >= box[2] || box[1] >= box[3])
                    throw new LeadError('INVALID_BOUNDS');
            }
            // Scan bounded batches until enough valid results; every cursor advances over
            // expired/withdrawn records as well, so filtering cannot trap pagination.
            const items = [];
            let next = cursor, exhausted = false;
            for (let scan = 0; scan < 20 && items.length < 25; scan++) {
                const rows = await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED', ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { summary: { contains: q, mode: 'insensitive' as const } }] } : {}), ...(box ? { longitude: { gte: box[0], lte: box[2] }, latitude: { gte: box[1], lte: box[3] } } : {}) }, orderBy: { id: 'asc' }, take: 50, ...(next ? { cursor: { id: next }, skip: 1 } : {}) });
                if (!rows.length) {
                    exhausted = true;
                    break;
                }
                for (const r of rows) {
                    next = r.id;
                    if (leadCurrent(r))
                        items.push(leadDTO(r, req.query.presentation === '1'));
                    if (items.length === 25)
                        break;
                }
                if (rows.length < 50 && items.length < 25) {
                    exhausted = true;
                    break;
                }
            }
            return res.json({ items, nextCursor: exhausted ? null : next, enabled: true });
        }
        catch (e) {
            return fail(res, e);
        }
    });
    router.get('/coordinate-layer', async (_req, res) => { try {
        if (!enabled())
            return res.json({ items: [], enabled: false });
        const rows = await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED' } });
        const values = new Map();
        for (const r of rows) {
            if (!leadCurrent(r))
                continue;
            const e = object(r.evidence);
            if (!e.coordinateNodeVersion)
                continue;
            values.set(e.coordinateSourceUrl, { sourceUrl: e.coordinateSourceUrl, nodeVersion: e.coordinateNodeVersion, latitude: r.latitude, longitude: r.longitude, crs: 'WGS84', accuracyMeters: null, qualityNotes: e.publicFacts?.coordinateQualityNotes ?? [], license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright' });
        }
        return res.json({ enabled: true, license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', items: [...values.values()] });
    }
    catch (e) {
        return fail(res, e);
    } });
    router.get('/inquiries/mine', authenticateToken, async (req: AuthRequest, res) => { try {
        if (!req.user || Object.keys(req.query).some(k=>k!=='cursor') || (req.query.cursor&&!isListingId(req.query.cursor))) return res.sendStatus(404);
        const rows=await prisma.sourceLeadInquiry.findMany({where:{buyerUserId:req.user.id},include:{lead:true},orderBy:{id:'asc'},take:26,...(req.query.cursor?{cursor:{id:String(req.query.cursor)},skip:1}:{})});
        return res.json({items:rows.slice(0,25).map(r=>({id:r.id,leadId:r.leadId,state:r.state,context:{id:r.leadId,title:r.lead.title,canonicalUrl:r.lead.canonicalUrl,county:r.lead.county,district:r.lead.district,contactRouting:contactRoutingDTO(r.lead),publicFacts:{priceText:object(r.lead.evidence).publicFacts?.priceText??'售價待詢問'},media:enabled()&&leadCurrent(r.lead)?sourceLeadMediaDTO(r.lead):[],priceText:object(r.lead.evidence).publicFacts?.priceText??'售價待詢問',thumbnailUrl:enabled()&&leadCurrent(r.lead)?sourceLeadMediaDTO(r.lead)[0]?.thumbnailUrl:undefined}})),nextCursor:rows.length>25?rows[24].id:null});
    } catch(e){return fail(res,e);} });
    router.get('/:id/media/:mediaId/:variant', async (req, res) => { try {
        if (!enabled() || !isListingId(req.params.id) || !isListingId(req.params.mediaId) || !['image','thumbnail'].includes(String(req.params.variant))) return res.sendStatus(404);
        const lead = await prisma.externalSourceLead.findUnique({where:{id:String(req.params.id)}});
        if (!lead || !leadCurrent(lead)) return res.sendStatus(404);
        const media = sourceLeadMedia(lead).find(m => m.id === req.params.mediaId);
        if (!media) return res.sendStatus(404);
        const url = req.params.variant === 'image' ? media.imageUrl : media.thumbnailUrl;
        const bytes = await new ListingFlickrStorage().read(url, media.flickrPhotoId);
        return res.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(bytes);
    } catch { return res.sendStatus(404); } });
    router.get('/:id', async (req, res) => { try {
        if (!enabled() || !isListingId(req.params.id))
            return res.sendStatus(404);
        const l = await prisma.externalSourceLead.findUnique({ where: { id: String(req.params.id) } });
        if (Object.keys(req.query).some(k => k !== 'presentation') || (req.query.presentation !== undefined && req.query.presentation !== '1')) throw new LeadError('INVALID_PRESENTATION');
        return l && leadCurrent(l) ? res.json(leadDTO(l, req.query.presentation === '1')) : res.sendStatus(404);
    }
    catch (e) {
        return fail(res, e);
    } });
    // Reading an inquiry must never allocate a receipt or mutate its events.
    router.get('/:id/inquiry', authenticateToken, async (req: AuthRequest, res) => { try {
        if (!req.user || !isListingId(req.params.id)) return res.sendStatus(404);
        const row = await prisma.sourceLeadInquiry.findUnique({
            where: { leadId_buyerUserId: { leadId: String(req.params.id), buyerUserId: req.user.id } },
            include: { lead: true }
        });
        return res.json(row ? dto(row, row.lead, req.query.presentation === '1') : null);
    } catch (e) { return fail(res, e); } });
    router.post('/:id/inquiry', authenticateToken, async (req: AuthRequest, res) => { try {
        if (!req.user || !isListingId(req.params.id))
            return res.sendStatus(404);
        if (req.body && Object.keys(req.body).length)
            throw new LeadError('INVALID_INPUT');
        const r = await prisma.$transaction(async (tx) => { await tx.$executeRaw `SELECT pg_advisory_xact_lock(${7300000000 + req.user!.id}::bigint)`; await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${req.params.id} FOR UPDATE`; const l = await tx.externalSourceLead.findUniqueOrThrow({ where: { id: String(req.params.id) } }); const old = await tx.sourceLeadInquiry.findUnique({ where: { leadId_buyerUserId: { leadId: l.id, buyerUserId: req.user!.id } } }); if (old)
            return dto(old, l, req.query.presentation === '1'); if (!enabled() || !leadCurrent(l))
            throw new LeadError('LEAD_UNAVAILABLE'); return dto(await tx.sourceLeadInquiry.create({ data: { leadId: l.id, buyerUserId: req.user!.id, leadContentHash: l.contentHash } }), l, req.query.presentation === '1'); });
        return res.json(r);
    }
    catch (e) {
        return fail(res, e);
    } });
    router.post('/:id/inquiry/:roomId/actions', authenticateToken, async (req: AuthRequest, res) => {
        try {
            const b = object(req.body);
            exact(b, ['requestId', 'action', 'text', 'consent', 'transferHash']);
            if (!isListingId(b.requestId) || !['ASK', 'CONSENT', 'CANCEL'].includes(b.action) || !isListingId(req.params.id) || !isListingId(req.params.roomId))
                throw new LeadError('INVALID_ACTION');
            if (b.action === 'ASK' ? (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(b.text) || !((b.consent === undefined && b.transferHash === undefined) || (b.consent === true && typeof b.transferHash === 'string'))) : (b.text !== undefined || (b.action === 'CONSENT' ? (b.consent !== true || typeof b.transferHash !== 'string') : b.consent !== undefined || b.transferHash !== undefined)))
                throw new LeadError('EXPLICIT_SCOPED_CONSENT_REQUIRED');
            const r = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT id FROM "ExternalSourceLead" WHERE id=${req.params.id} FOR UPDATE`;
                await tx.$executeRaw `SELECT id FROM "SourceLeadInquiry" WHERE id=${req.params.roomId} FOR UPDATE`;
                const room = await tx.sourceLeadInquiry.findFirst({ where: { id: String(req.params.roomId), leadId: String(req.params.id), buyerUserId: req.user!.id }, include: { lead: true } });
                if (!room)
                    throw new LeadError('ROOM_NOT_FOUND');
                const events = room.events as unknown as LeadEvent[], old = events.find(e => e.requestId === b.requestId);
                if (old) {
                    if (old.action !== b.action || old.text !== b.text || old.consent !== b.consent || old.payloadHash !== b.transferHash)
                        throw new LeadError('REQUEST_CONFLICT');
                    return dto(room, room.lead, req.query.presentation === '1');
                }
                if (b.action !== 'CANCEL' && (!enabled() || !leadCurrent(room.lead) || room.leadContentHash !== room.lead.contentHash))
                    throw new LeadError('LEAD_UNAVAILABLE');
                if (['CANCELLED', 'DELIVERED', 'CANCEL_REQUESTED', 'DELIVERY_REQUIRES_REVIEW'].includes(room.state))
                    throw new LeadError('INQUIRY_CLOSED');
                if (events.length >= 199 && b.action !== 'CANCEL')
                    throw new LeadError('INQUIRY_LIMIT');
                let state = room.state, consentHash = room.consentHash;
                if (b.action === 'ASK' && state !== 'INQUIRY')
                    throw new LeadError('CONSENT_CONTENT_FROZEN');
                if (b.action === 'ASK' && b.consent === true) {
                    if (b.transferHash !== digest(transferSnapshot(room.lead,events))) throw new LeadError('CONSENT_SNAPSHOT_MISMATCH');
                    if (privateContactField({title:b.text}) || events.filter(e=>e.action==='ASK').some(e=>privateContactField({title:e.text??''}))) throw new LeadError('PRIVATE_CONTACT_NOT_FORWARDED');
                    const nextQuestions=[...events,{requestId:b.requestId,action:'ASK',text:b.text,at:new Date().toISOString()}];
                    consentHash=digest(transferSnapshot(room.lead,nextQuestions)); state='WAITING_ROUTE';
                }
                if (b.action === 'CONSENT') {
                    const snapshot = transferSnapshot(room.lead, events);
                    if (state !== 'INQUIRY' || !snapshot.questions.length || b.transferHash !== digest(snapshot))
                        throw new LeadError('CONSENT_SNAPSHOT_MISMATCH');
                    state = 'WAITING_ROUTE';
                    consentHash = b.transferHash;
                }
                if (b.action === 'CANCEL') {
                    state = room.state === 'TRANSFER_RESERVED' ? 'CANCEL_REQUESTED' : 'CANCELLED';
                    consentHash = null;
                }
                const event = { requestId: b.requestId, action: b.action, at: new Date().toISOString(), ...(b.text !== undefined ? { text: b.text } : {}), ...(b.action === 'ASK' && b.consent === true ? {consent:true,payloadHash:b.transferHash}:{}), ...(b.action === 'CONSENT' ? { consent: true, questionIds: events.filter(e => e.action === 'ASK').map(e => e.requestId), payloadHash: b.transferHash } : {}) };
                const saved = await tx.sourceLeadInquiry.update({ where: { id: room.id }, data: { state, consentHash, ...(b.action === 'CANCEL' && room.delivery ? { delivery: { ...object(room.delivery), cancelRequestedAt: new Date().toISOString() } } : {}), events: [...events, event] as unknown as Prisma.InputJsonValue } });
                return dto(saved, room.lead, req.query.presentation === '1');
            });
            return res.json(r);
        }
        catch (e) {
            return fail(res, e);
        }
    });
    return router;
}
