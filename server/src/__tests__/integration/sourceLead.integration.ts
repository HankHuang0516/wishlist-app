import express from 'express';
import request from 'supertest';
import prisma from '../../lib/prisma';
import { createSourceLeadRoutes, createSourceLeadAdmin } from '../../routes/sourceLeadRoutes';
import { digest } from '../../lib/sourceLeadRules';
const run = !!process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('independent source lead map -> inquiry (synthetic local DB)', () => {
    let verifiedDb = false;
    const previousFlag = process.env.SOURCE_LEADS_PUBLIC_ENABLED;
    let app: ReturnType<typeof express>, leadId: string, buyer: number, other: number, roomId: string;
    const key = require('crypto').randomUUID(), otherKey = require('crypto').randomUUID(), admin = 'synthetic-lead-admin';
    const body = (id = 'SYNTHETIC-LEAD') => ({ archiveItemId: id, libraryFileId: 'libfile_' + 'a'.repeat(32), archiveVersion: 3, archiveSha256: 'a'.repeat(64), title: '來源線索：合成二手書', summary: '合成測試來源；庫存與交易待確認。', canonicalUrl: 'https://www.facebook.com/groups/123456789/posts/' + id, county: '臺南市', district: '永康區', publicPlaceName: '合成公開面交點', publicAddress: '臺南市永康區合成路123號', latitude: 23.0, longitude: 120.236, postedEarliestAt: new Date(Date.now() - 86400000).toISOString(), postedLatestAt: new Date(Date.now() - 86400000).toISOString(), checkedAt: new Date().toISOString(), evidence: { sourceUrl: 'https://www.facebook.com/groups/123456789/posts/' + id, sourcePublic: true, publicSourceRef: 'self:synthetic-public', dateRef: 'self:synthetic-original-date', locationRef: 'self:synthetic-location', coordinateRef: 'self:synthetic-coordinate', locationSourceUrl: 'https://public.example.invalid/place/qa', coordinateSourceUrl: 'https://public.example.invalid/map/qa', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'self:synthetic-review' } });
    const importLead = (items: any[], dryRun = false) => request(app).post('/admin/import').set('x-admin-key', admin).send({ items, dryRun });
    const open = () => request(app).post('/leads/' + leadId + '/inquiry').set('x-api-key', key).send({});
    const act = (b: any, k = key) => request(app).post('/leads/' + leadId + '/inquiry/' + roomId + '/actions').set('x-api-key', k).send(b);
    beforeAll(async () => { require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.DATABASE_URL); verifiedDb = true; process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1'; buyer = (await prisma.user.create({ data: { phoneNumber: 'synthetic-lead-buyer', password: 'unused', apiKey: key } })).id; other = (await prisma.user.create({ data: { phoneNumber: 'synthetic-lead-other', password: 'unused', apiKey: otherKey } })).id; });
    beforeEach(() => { app = express(); app.use(express.json()); app.use('/leads', createSourceLeadRoutes()); app.use('/admin', createSourceLeadAdmin(() => admin)); });
    afterAll(async () => { if (!verifiedDb) return; if (previousFlag === undefined) delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; else process.env.SOURCE_LEADS_PUBLIC_ENABLED = previousFlag; await prisma.sourceLeadInquiry.deleteMany({ where: { buyerUserId: { in: [buyer, other] } } }); await prisma.externalSourceLead.deleteMany({ where: { archiveItemId: { startsWith: 'SYNTHETIC-' } } }); await prisma.user.deleteMany({ where: { id: { in: [buyer, other] } } }); await prisma.$disconnect(); });
    test('no admin, missing original date/public point/copied text/private contact: atomic reject; no inventory writes', async () => {
        expect((await request(app).post('/admin/import').send({ items: [body()], dryRun: false })).status).toBe(401);
        const invalid = [{ ...body(), postedEarliestAt: new Date(Date.now() - 100 * 86400000).toISOString() }, { ...body(), publicAddress: '臺南市永康區' }, { ...body(), summary: '聯絡 example@example.com' }, { ...body(), imageUrl: 'https://example.invalid/copied.jpg' }, { ...body(), evidence: { ...body().evidence, noCopiedTextOrImages: false } }, { ...body(), evidence: { ...body().evidence, sourcePublic: false } }, { ...body(), evidence: { ...body().evidence, sourceUrl: 'https://www.facebook.com/groups/other/posts/other' } }];
        for (const row of invalid)
            expect((await importLead([body('SYNTHETIC-GOOD'), row])).status).toBe(409);
        expect(await prisma.externalSourceLead.count()).toBe(0);
        expect(await prisma.listing.count()).toBe(0);
        expect((await importLead([body()], true)).body.persistedCount).toBe(0);
        expect(await prisma.externalSourceLead.count()).toBe(0);
    });
    test('public coordinate notes and place fields cannot expose private phone/email/LINE', async () => {
        for (const value of ['0935123456', 'seller@example.com', 'LINE ID:abc']) {
            const note = { ...body(), evidence: { ...body().evidence, publicFacts: { priceText: '原帖價格待確認', priceUnitStatus: 'unknown', currencyStatus: 'unknown', sourceAccessNotice: '可能需登入', originalDateLabel: '原始日期區間', locationRelation: '公共面交點非現貨位置', coordinateQualityNotes: [value] } } };
            expect((await importLead([note])).status).toBe(409);
            expect((await importLead([{ ...body(), publicPlaceName: value }])).status).toBe(409);
        }
    });
    test('published research lead needs no stock/images/rights; white-list DTO and bbox separate from inventory', async () => {
        const r = await importLead([body()]);
        expect(r.status).toBe(200);
        leadId = r.body.ids[0];
        expect(r.body.qualifiedSupplyCount).toBe(0);
        const pub = await request(app).get('/leads/' + leadId);
        expect(pub.status).toBe(200);
        expect(pub.body.stockStatus).toBe('UNKNOWN');
        expect(pub.body.checkoutEnabled).toBe(false);
        expect(pub.body).not.toHaveProperty('evidence');
        expect(pub.body).not.toHaveProperty('imageUrl');
        expect(pub.body).not.toHaveProperty('sellerRoute');
        expect((await request(app).get('/leads?bbox=120.23,22.99,120.24,23.01')).body.items).toHaveLength(1);
        expect((await request(app).get('/leads?bbox=121,25,122,26')).body.items).toHaveLength(0);
        expect((await importLead([{ ...body(), archiveVersion: 2 }])).body.errorCode).toBe('STALE_OR_CONFLICTING_LEAD');
        expect((await importLead([{ ...body(), summary: 'same version changed content' }])).status).toBe(409);
    });
    test('GET before and after opening reads only the authenticated buyer without allocating receipts', async () => {
        const before = await prisma.sourceLeadInquiry.count();
        for (let i = 0; i < 2; i++) {
            const result = await request(app).get('/leads/' + leadId + '/inquiry').set('x-api-key', key);
            expect(result.status).toBe(200);
            expect(result.body).toBeNull();
        }
        expect(await prisma.sourceLeadInquiry.count()).toBe(before);
        const opened = await open();
        expect(opened.status).toBe(200);
        const read = await request(app).get('/leads/' + leadId + '/inquiry').set('x-api-key', key);
        expect(read.body.id).toBe(opened.body.id);
        expect(read.body.events).toEqual([]);
        expect((await request(app).get('/leads/' + leadId + '/inquiry').set('x-api-key', otherKey)).body).toBeNull();
        expect(await prisma.sourceLeadInquiry.count()).toBe(before + 1);
    });
    test('single buyer room, ownership, exact request replay; consent freezes question IDs; waiting is not sent', async () => {
        const rooms = await Promise.all([open(), open()]);
        expect(rooms.every(r => r.status === 200)).toBe(true);
        expect(rooms[0].body.id).toBe(rooms[1].body.id);
        roomId = rooms[0].body.id;
        const b = { requestId: require('crypto').randomUUID(), action: 'ASK', text: '想詢問取貨方式' };
        expect((await act(b, otherKey)).status).toBe(409);
        const ask = await act(b);
        expect(ask.status).toBe(200);
        expect((await act(b)).body.events).toHaveLength(1);
        expect((await act({ ...b, text: 'different' })).status).toBe(409);
        const invalidConsent=await act({ requestId: require('crypto').randomUUID(), action: 'CONSENT', consent: true, transferHash: '0'.repeat(64) });expect({status:invalidConsent.status,error:invalidConsent.body.errorCode}).toEqual({status:409,error:'CONSENT_SNAPSHOT_MISMATCH'});
        const consent = await act({ requestId: require('crypto').randomUUID(), action: 'CONSENT', consent: true, transferHash: ask.body.transferHash });
        expect(consent.body.state).toBe('WAITING_ROUTE');
        expect(consent.body.delivered).toBe(false);
        expect(consent.body.routeVerified).toBe(false);
        expect((await act({ requestId: require('crypto').randomUUID(), action: 'ASK', text: '後補私人聯絡' })).status).toBe(409);
        expect((await request(app).post('/admin/inquiries/' + roomId + '/prepare-transfer').set('x-admin-key', admin).send({ requestId: require('crypto').randomUUID() })).status).toBe(409);
    });
    test('verified original seller UI route only; delivery binds exact route/consent/source and receipt; replay', async () => {
        const lead = await prisma.externalSourceLead.findUniqueOrThrow({ where: { id: leadId } });
        const route = { leadId, sourceUrl: lead.canonicalUrl, contentHash: lead.contentHash, channel: 'FACEBOOK_UI', publicRouteUrl: 'https://www.facebook.com/synthetic.seller', identityEvidenceRef: 'self:synthetic-seller', routeEvidenceRef: 'self:synthetic-ui-route', confirmOriginalSeller: true };
        const routePost = (b: any) => request(app).post('/admin/' + leadId + '/seller-route').set('x-admin-key', admin).send(b);
        expect((await routePost({ ...route, publicRouteUrl: lead.canonicalUrl })).status).toBe(409);
        expect((await routePost(route)).status).toBe(200);
        const transfer = await request(app).post('/admin/inquiries/' + roomId + '/prepare-transfer').set('x-admin-key', admin).send({ requestId: require('crypto').randomUUID() });
        expect(transfer.status).toBe(200);
        expect((await request(app).get('/admin/inquiries/' + roomId + '/transfer-preflight').set('x-admin-key', admin)).status).toBe(200);
        expect(transfer.body.snapshot.questions).toHaveLength(1);
        const proof = { requestId: require('crypto').randomUUID(), reservationId: transfer.body.reservation.id, payloadHash: transfer.body.reservation.payloadHash, routeHash: digest(transfer.body.route), leadId, sourceUrl: lead.canonicalUrl, channel: 'FACEBOOK_UI', receiptRef: 'self:synthetic-not-real-send', sentAt: new Date().toISOString(), outcome: 'CONFIRMED_SENT' };
        const deliver = (b: any) => request(app).post('/admin/inquiries/' + roomId + '/delivery').set('x-admin-key', admin).send(b);
        expect((await deliver({ ...proof, routeHash: '0'.repeat(64) })).status).toBe(409);
        await request(app).post('/admin/' + leadId + '/withdraw').set('x-admin-key', admin).send({ reasonRef: 'self:synthetic-reserved-withdraw' });
        const delivered = await deliver(proof);
        expect(delivered.status).toBe(200);
        expect(delivered.body.state).toBe('DELIVERY_REQUIRES_REVIEW');
        expect(delivered.body.delivery.verification).toBe('MANUAL_UI_RECEIPT');
        expect(delivered.body.delivery).not.toHaveProperty('receiptRef');
        expect(delivered.body.orderCreated).toBe(false);
        expect((await deliver(proof)).status).toBe(200);
        expect((await deliver({ ...proof, requestId: require('crypto').randomUUID() })).status).toBe(409);
    });
    test('cancel during reserved transfer blocks preflight; confirmed actual receipt stays auditable; feature OFF blocks new transfer', async () => {
        const added = await importLead([body('SYNTHETIC-RACE')]), id = added.body.ids[0];
        const opened = await request(app).post('/leads/' + id + '/inquiry').set('x-api-key', otherKey).send({});
        const rid = opened.body.id, actionPath = '/leads/' + id + '/inquiry/' + rid + '/actions';
        const ask = await request(app).post(actionPath).set('x-api-key', otherKey).send({ requestId: require('crypto').randomUUID(), action: 'ASK', text: '詢問交付' });
        await request(app).post(actionPath).set('x-api-key', otherKey).send({ requestId: require('crypto').randomUUID(), action: 'CONSENT', consent: true, transferHash: ask.body.transferHash });
        const lead = await prisma.externalSourceLead.findUniqueOrThrow({ where: { id } });
        await request(app).post('/admin/' + id + '/seller-route').set('x-admin-key', admin).send({ leadId: id, sourceUrl: lead.canonicalUrl, contentHash: lead.contentHash, channel: 'FACEBOOK_UI', publicRouteUrl: 'https://www.facebook.com/synthetic.seller', identityEvidenceRef: 'self:synthetic-seller', routeEvidenceRef: 'self:synthetic-route', confirmOriginalSeller: true });
        process.env.SOURCE_LEADS_PUBLIC_ENABLED = '0';
        expect((await request(app).post('/admin/inquiries/' + rid + '/prepare-transfer').set('x-admin-key', admin).send({ requestId: require('crypto').randomUUID() })).status).toBe(409);
        process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1';
        const reserved = await request(app).post('/admin/inquiries/' + rid + '/prepare-transfer').set('x-admin-key', admin).send({ requestId: require('crypto').randomUUID() });
        expect(reserved.status).toBe(200);
        expect((await request(app).post(actionPath).set('x-api-key', otherKey).send({ requestId: require('crypto').randomUUID(), action: 'CANCEL' })).body.state).toBe('CANCEL_REQUESTED');
        expect((await request(app).get('/admin/inquiries/' + rid + '/transfer-preflight').set('x-admin-key', admin)).status).toBe(409);
        const v = reserved.body.reservation;
        const late = await request(app).post('/admin/inquiries/' + rid + '/delivery').set('x-admin-key', admin).send({ requestId: require('crypto').randomUUID(), reservationId: v.id, payloadHash: v.payloadHash, routeHash: v.routeHash, leadId: id, sourceUrl: lead.canonicalUrl, channel: v.channel, receiptRef: 'self:synthetic-race-receipt', sentAt: new Date().toISOString(), outcome: 'CONFIRMED_SENT' });
        expect(late.status).toBe(200);
        expect(late.body.state).toBe('DELIVERY_REQUIRES_REVIEW');
        expect(late.body.delivered).toBe(true);
        expect(late.body.orderCreated).toBe(false);
        await request(app).post('/admin/' + id + '/withdraw').set('x-admin-key', admin).send({ reasonRef: 'self:synthetic-race-withdraw' });
    });
    test('contact send atomically scopes consent, reaches admin inbox and never claims seller delivery', async()=>{
        const imported=await importLead([body('SYNTHETIC-CONTACT')]); const lid=imported.body.ids[0];
        const opened=await request(app).post('/leads/'+lid+'/inquiry?presentation=1').set('x-api-key',key).send({});
        const rid=opened.body.id,b={requestId:require('crypto').randomUUID(),action:'ASK',text:'請確認是否仍在售及取貨方式',consent:true,transferHash:opened.body.transferHash};
        const send=()=>request(app).post('/leads/'+lid+'/inquiry/'+rid+'/actions?presentation=1').set('x-api-key',key).send(b);
        const result=await send();expect(result.status).toBe(200);expect(result.body.state).toBe('WAITING_ROUTE');expect(result.body.delivered).toBe(false);expect(result.body.routeVerified).toBe(false);expect(result.body.orderCreated).toBe(false);
        expect((await send()).body.events).toHaveLength(1);
        const inbox=await request(app).get('/admin/inquiries').set('x-admin-key',admin); const item=inbox.body.items.find((r:any)=>r.id===rid);expect(item.source.id).toBe(lid);expect(item.source.archiveItemId).toBe('SYNTHETIC-CONTACT');expect(item.events[0].text).toBe(b.text);
        const own=await request(app).get('/leads/inquiries/mine').set('x-api-key',key);expect(own.body.items.some((r:any)=>r.id===rid)).toBe(true);
        const foreign=await request(app).get('/leads/inquiries/mine').set('x-api-key',otherKey);expect(foreign.body.items.some((r:any)=>r.id===rid)).toBe(false);
        const blocked=await request(app).post('/admin/inquiries/'+rid+'/prepare-transfer').set('x-admin-key',admin).send({requestId:require('crypto').randomUUID()});expect(blocked.status).toBe(409);
        await request(app).post('/leads/'+lid+'/inquiry/'+rid+'/actions').set('x-api-key',key).send({requestId:require('crypto').randomUUID(),action:'CANCEL'});
        expect((await request(app).post('/admin/inquiries/'+rid+'/prepare-transfer').set('x-admin-key',admin).send({requestId:require('crypto').randomUUID()})).status).toBe(409);
    });
    test('one-step consent rejects multi-device changed history and private contact details',async()=>{
        const imported=await importLead([body('SYNTHETIC-CONTACT-RACE')]);expect({status:imported.status,error:imported.body.errorCode}).toEqual({status:200,error:undefined});const lid=imported.body.ids[0];const room=(await request(app).post('/leads/'+lid+'/inquiry').set('x-api-key',key).send({})).body;
        const path='/leads/'+lid+'/inquiry/'+room.id+'/actions';
        await request(app).post(path).set('x-api-key',key).send({requestId:require('crypto').randomUUID(),action:'ASK',text:'另一裝置問題'});
        const changed=await request(app).post(path).set('x-api-key',key).send({requestId:require('crypto').randomUUID(),action:'ASK',text:'購買意願',consent:true,transferHash:room.transferHash});expect(changed.body.errorCode).toBe('CONSENT_SNAPSHOT_MISMATCH');
        const latest=(await request(app).get('/leads/'+lid+'/inquiry').set('x-api-key',key)).body;
        const privateMsg=await request(app).post(path).set('x-api-key',key).send({requestId:require('crypto').randomUUID(),action:'ASK',text:'請回覆 seller@example.com',consent:true,transferHash:latest.transferHash});expect(privateMsg.body.errorCode).toBe('PRIVATE_CONTACT_NOT_FORWARDED');
        expect((await request(app).get('/leads/'+lid+'/inquiry').set('x-api-key',key)).body.events).toHaveLength(1);
    });
    test('seller reply requires item/post/verified route/actual receipt; repeats cannot cross buyer threads',async()=>{
        const imported=await importLead([body('SYNTHETIC-REPLY')]);const lid=imported.body.ids[0];const l=await prisma.externalSourceLead.findUniqueOrThrow({where:{id:lid}});
        const review={leadId:lid,sourceUrl:l.canonicalUrl,contentHash:l.contentHash,status:'UNAVAILABLE',identityEvidenceRef:'review:synthetic-author-observed',routeEvidenceRef:'review:synthetic-page-cannot-message',reason:'以品牌粉專核對原賣家訊息入口，平台顯示無法聯絡；未外送。',checkedAt:new Date().toISOString()};
        const reviewPath='/admin/'+lid+'/seller-route-review';
        expect((await request(app).post(reviewPath).send(review)).status).toBe(401);
        expect((await request(app).post(reviewPath).set('x-admin-key',admin).send({...review,status:'VERIFIED'})).status).toBe(409);
        expect((await request(app).post(reviewPath).set('x-admin-key',admin).send({...review,sourceUrl:'https://example.invalid/wrong-post'})).status).toBe(409);
        expect((await request(app).post(reviewPath).set('x-admin-key',admin).send(review)).body.routeVerified).toBe(false);
        const reviewed=(await request(app).get('/leads/'+lid+'?presentation=1')).body;
        expect(reviewed.contactRouting.status).toBe('UNAVAILABLE');expect(reviewed.contactRouting).not.toHaveProperty('identityEvidenceRef');
        const room=(await request(app).post('/leads/'+lid+'/inquiry').set('x-api-key',key).send({})).body;
        await request(app).post('/leads/'+lid+'/inquiry/'+room.id+'/actions').set('x-api-key',key).send({requestId:require('crypto').randomUUID(),action:'ASK',text:'確認現貨',consent:true,transferHash:room.transferHash});
        await request(app).post('/admin/'+lid+'/seller-route').set('x-admin-key',admin).send({leadId:lid,contentHash:l.contentHash,sourceUrl:l.canonicalUrl,channel:'FACEBOOK_UI',publicRouteUrl:'https://m.me/synthetic-seller',identityEvidenceRef:'review:synthetic-identity',routeEvidenceRef:'review:synthetic-route',confirmOriginalSeller:true});
        const reservationId=require('crypto').randomUUID();const prepared=await request(app).post('/admin/inquiries/'+room.id+'/prepare-transfer').set('x-admin-key',admin).send({requestId:reservationId});expect(prepared.status).toBe(200);
        const reservation=prepared.body.reservation;
        await request(app).post('/admin/inquiries/'+room.id+'/delivery').set('x-admin-key',admin).send({requestId:require('crypto').randomUUID(),reservationId,payloadHash:reservation.payloadHash,routeHash:reservation.routeHash,leadId:lid,sourceUrl:l.canonicalUrl,channel:'FACEBOOK_UI',receiptRef:'review:synthetic-send-receipt',sentAt:new Date().toISOString(),outcome:'CONFIRMED_SENT'});
        const reply={requestId:require('crypto').randomUUID(),leadId:lid,sourceUrl:l.canonicalUrl,routeHash:reservation.routeHash,reservationId,text:'合成原賣家：仍在售，僅本地測試',receiptRef:'review:synthetic-reply-receipt',receivedAt:new Date().toISOString()};
        const endpoint='/admin/inquiries/'+room.id+'/seller-reply';
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send({...reply,leadId:require('crypto').randomUUID()})).status).toBe(409);
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send({...reply,receivedAt:new Date(Date.now()-3600000).toISOString()})).status).toBe(409);
        const posted=await request(app).post(endpoint).set('x-admin-key',admin).send(reply);expect(posted.status).toBe(200);expect(posted.body.events.filter((e:any)=>e.action==='SELLER_REPLY')).toHaveLength(1);
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send(reply)).body.events.filter((e:any)=>e.action==='SELLER_REPLY')).toHaveLength(1);
        const legacy=(await request(app).get('/leads/'+lid+'/inquiry').set('x-api-key',key)).body;expect(legacy.events.some((e:any)=>e.action==='SELLER_REPLY')).toBe(false);
        const modern=(await request(app).get('/leads/'+lid+'/inquiry?presentation=1').set('x-api-key',key)).body;expect(modern.events.some((e:any)=>e.text===reply.text)).toBe(true);
        expect((await request(app).get('/leads/'+lid+'/inquiry?presentation=1').set('x-api-key',otherKey)).body).toBeNull();
        const stored=await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:room.id}}),delivery=stored.delivery as any;
        const current=await prisma.externalSourceLead.findUniqueOrThrow({where:{id:lid}}),originalRoute=current.sellerRoute as any;
        const oldTime=new Date(Date.now()-25*3600000).toISOString();
        await prisma.sourceLeadInquiry.update({where:{id:room.id},data:{delivery:{...delivery,receipt:{...delivery.receipt,sentAt:oldTime}}}});
        await prisma.externalSourceLead.update({where:{id:lid},data:{sellerRoute:{...originalRoute,verifiedAt:oldTime}}});
        const lateReply={...reply,requestId:require('crypto').randomUUID(),text:'合成賣家隔日回覆',receiptRef:'review:synthetic-nextday-reply',receivedAt:new Date().toISOString()};
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send(lateReply)).status).toBe(409);
        const reverify=(publicRouteUrl:string)=>request(app).post('/admin/'+lid+'/seller-route').set('x-admin-key',admin).send({leadId:lid,contentHash:l.contentHash,sourceUrl:l.canonicalUrl,channel:originalRoute.channel,publicRouteUrl,identityEvidenceRef:originalRoute.identityEvidenceRef,routeEvidenceRef:'review:synthetic-new-attestation',confirmOriginalSeller:true});
        await reverify('https://m.me/wrong-seller');
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send(lateReply)).status).toBe(409);
        await reverify(originalRoute.publicRouteUrl);
        expect((await request(app).post(endpoint).set('x-admin-key',admin).send(lateReply)).status).toBe(200);
        expect(((await prisma.sourceLeadInquiry.findUniqueOrThrow({where:{id:room.id}})).delivery as any).receipt.routeHash).toBe(delivery.receipt.routeHash);

    });

    test('twenty synthetic leads validate atomically without stock or copied images', async () => {
        const before = await prisma.externalSourceLead.count();
        const result = await importLead(Array.from({length:20}, (_,i)=>body('SYNTHETIC-DRY-'+i)), true);
        expect(result.status).toBe(200);
        expect(result.body.validatedCount).toBe(20);
        expect(result.body.persistedCount).toBe(0);
        expect(await prisma.externalSourceLead.count()).toBe(before);
    });
    test('withdrawal stops map/ASK/consent, cancel works; 31-row pagination and buyer erase cascade', async () => {
        const extra = body('SYNTHETIC-WITHDRAW');
        const added = await importLead([extra]);
        const id = added.body.ids[0];
        const room = await request(app).post('/leads/' + id + '/inquiry').set('x-api-key', otherKey).send({});
        const endpoint = '/leads/' + id + '/inquiry/' + room.body.id + '/actions';
        expect((await request(app).post('/admin/' + id + '/withdraw').set('x-admin-key', admin).send({ reasonRef: 'self:synthetic-withdraw' })).status).toBe(200);
        expect((await request(app).get('/leads/' + id)).status).toBe(404);
        expect((await request(app).post(endpoint).set('x-api-key', otherKey).send({ requestId: require('crypto').randomUUID(), action: 'ASK', text: 'hi' })).status).toBe(409);
        expect((await request(app).post(endpoint).set('x-api-key', otherKey).send({ requestId: require('crypto').randomUUID(), action: 'CANCEL' })).body.state).toBe('CANCELLED');
        for (let i = 0; i < 30; i += 10)
            expect((await importLead(Array.from({ length: 10 }, (_, j) => body('SYNTHETIC-PAGE-' + (i + j))))).status).toBe(200);
        const ids: string[] = [];
        let cursor: null | string = null;
        do {
            const page = await request(app).get('/leads' + (cursor ? '?cursor=' + cursor : ''));
            expect(page.status).toBe(200);
            ids.push(...page.body.items.map((r: any) => r.id));
            cursor = page.body.nextCursor;
        } while (cursor);
        expect(new Set(ids).size).toBe(33);
        await prisma.user.delete({ where: { id: other } });
        expect(await prisma.sourceLeadInquiry.count({ where: { buyerUserId: other } })).toBe(0);
    });

});
