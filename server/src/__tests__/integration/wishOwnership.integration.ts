import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { authenticateToken } from '../../middleware/auth';
import { updateItem } from '../../controllers/wishItemController';
import { createWishlist, getWishlist, getWishlists, updateWishlist, deleteWishlist } from '../../controllers/wishlistController';
import { getItem, getPublicItems } from '../../controllers/wishItemReadController';
import { cloneItem, getCloneReceipt, abandonClone } from '../../controllers/wishCloneController';
import { createNativeWish } from '../../controllers/nativeWishController';
import { deleteItem } from '../../controllers/wishDeleteController';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'wish-ownership-integration-only'; process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.put('/api/items/:id', authenticateToken, updateItem); app.post('/api/wishlists', authenticateToken, createWishlist);
app.get('/api/items/public', getPublicItems);
app.get('/api/items/:id', authenticateToken, getItem);
app.get('/api/wishlists/:id', authenticateToken, getWishlist);
app.get('/api/wishlists', authenticateToken, getWishlists);
app.put('/api/wishlists/:id', authenticateToken, updateWishlist);
app.delete('/api/wishlists/:id', authenticateToken, deleteWishlist);
app.post('/api/items/:id/clone', authenticateToken, cloneItem);
app.get('/api/items/clone-receipts/:clientRequestId', authenticateToken, getCloneReceipt);
app.post('/api/items/clone-receipts/:clientRequestId/abandon', authenticateToken, abandonClone);
app.post('/api/native-wishes/lists/:id/items', authenticateToken, createNativeWish);
app.delete('/api/items/:id', authenticateToken, deleteItem);
const server = createServer(app);
let owner: number, first: number, second: number, listId: number, itemId: number;
const auth = (id: number) => 'Bearer ' + jwt.sign({ id }, secret, { algorithm: 'HS256' });
const edit = (body: unknown, userId = owner) => request(server).put('/api/items/' + itemId).set('Authorization', auth(userId)).send(body as object);
beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
    const run = randomUUID(); const users = await Promise.all(['owner', 'first', 'second'].map(role => prisma.user.create({ data: { phoneNumber: `wish-owner-${run}-${role}`, name: role, password: 'synthetic-only' }, select: { id: true } })));
    [owner, first, second] = users.map(u => u.id);
});
beforeEach(async () => {
    await prisma.wishlist.deleteMany({ where: { userId: { in: [owner, first, second] } } });
    const list = await prisma.wishlist.create({ data: { userId: owner, title: '合成私密清單', items: { create: { name: 'Sony 相機', price: '45000', currency: 'USD', maxPrice: 5000, priceCurrency: 'TWD', notes: '合成私密筆記', proxy_end_user_id: 'synthetic-private-reference' } } }, include: { items: true } });
    listId = list.id; itemId = list.items[0].id;
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, first, second] } } });
    await prisma.$disconnect();
});
describe('wish privacy and fulfillment / actual PostgreSQL transactions', () => {
    const target = (userId = first,maxItems=100) => prisma.wishlist.create({data:{userId,title:'合成複製目標',maxItems}});
    const copy = (targetWishlistId:number,userId=first,clientRequestId?:string) => request(server).post('/api/items/'+itemId+'/clone').set('Authorization',auth(userId)).send({targetWishlistId,...(clientRequestId?{clientRequestId}:{})});
    const receiptUrl=(key:string,targetWishlistId:number,sourceItemId=itemId)=>'/api/items/clone-receipts/'+key+'?sourceItemId='+sourceItemId+'&targetWishlistId='+targetWishlistId;
    it('denies cloning private or hidden sources, and cannot copy into another owner target',async()=>{
        const destination=await target();expect((await copy(destination.id)).status).toBe(404);
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{isHidden:true,aiStatus:'SKIPPED'}});
        expect((await copy(destination.id)).status).toBe(404);
        await prisma.item.update({where:{id:itemId},data:{isHidden:false}});expect((await copy(listId)).status).toBe(403);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
    });
    it('copies a visible public wish with separate budget and AI price, retaining attribution without private references',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED',isPurchased:true,purchasedById:second,originalUserId:second,aiError:'403 synthetic-private-diagnostic'}});
        const destination=await target(),key=randomUUID(),r=await copy(destination.id,first,key);expect(r.status).toBe(201);expect(r.headers['cache-control']).toBe('private, no-store');
        expect(r.body).toMatchObject({wishlistId:destination.id,clonedFromItemId:itemId,clientRequestId:key,replayed:false,maxPrice:5000,priceCurrency:'TWD',price:'45000',currency:'USD',originalUserId:second,isPurchased:false,purchasedById:null,isHidden:false,aiStatus:'SKIPPED',aiError:'403',proxy_end_user_id:null});
        expect(r.body.id).not.toBe(itemId);expect(JSON.stringify(r.body)).not.toContain('synthetic-private-diagnostic');expect(await prisma.wishCreateReceipt.findUnique({where:{userId_clientRequestId:{userId:first,clientRequestId:key}}})).toMatchObject({kind:'CLONE',resourceId:r.body.id});
    });
    it('retains legacy owner copying of a private hidden wish and default target selection',async()=>{
        await prisma.item.update({where:{id:itemId},data:{isHidden:true,aiStatus:'SKIPPED'}});
        const r=await request(server).post('/api/items/'+itemId+'/clone').set('Authorization',auth(owner)).send({});expect(r.status).toBe(201);expect(r.body).toMatchObject({wishlistId:listId,originalUserId:owner,isHidden:false,maxPrice:5000,aiStatus:'SKIPPED'});
    });
    it('serializes capacity for concurrent clones rather than overfilling the native list bound',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(first,1);
        const results=await Promise.all([copy(destination.id,first,randomUUID()),copy(destination.id,first,randomUUID())]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(1);
    });
    it('shares the capacity lock with native wish creation',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(first,1);
        const create=request(server).post('/api/native-wishes/lists/'+destination.id+'/items').set('Authorization',auth(first)).send({clientRequestId:randomUUID(),name:'合成原生手動願望'});
        const results=await Promise.all([copy(destination.id,first,randomUUID()),create]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(1);
    });
    it('serializes simultaneous original requests with the same clone identity to one wish',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(),key=randomUUID();
        const results=await Promise.all([copy(destination.id,first,key),copy(destination.id,first,key)]);expect(results.map(r=>r.status)).toEqual([201,201]);expect(new Set(results.map(r=>r.body.id)).size).toBe(1);expect(results.filter(r=>r.body.replayed)).toHaveLength(1);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(1);
    });
    it('replays the same clone receipt without duplicating or adopting later source changes, and rejects changed targets',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(),key=randomUUID(),firstCopy=await copy(destination.id,first,key);expect(firstCopy.status).toBe(201);
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:false}});await prisma.item.update({where:{id:itemId},data:{name:'後來修改的合成來源',maxPrice:999}});
        const replay=await copy(destination.id,first,key);expect(replay.status).toBe(201);expect(replay.body).toMatchObject({id:firstCopy.body.id,name:'Sony 相機',maxPrice:5000,replayed:true});expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(1);
        const changed=await target();expect((await copy(changed.id,first,key)).status).toBe(409);
    });
    it('returns owner-bound clone history and a tombstone after later deletion without recreating',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(),key=randomUUID(),created=await copy(destination.id,first,key);expect(created.status).toBe(201);
        const url=receiptUrl(key,destination.id);expect((await request(server).get(url).set('Authorization',auth(second))).status).toBe(404);expect((await request(server).get(receiptUrl(key,destination.id,itemId+10000)).set('Authorization',auth(first))).status).toBe(409);
        const found=await request(server).get(url).set('Authorization',auth(first));expect(found.body).toMatchObject({clientRequestId:key,kind:'CLONE',sourceItemId:itemId,targetWishlistId:destination.id,state:'CREATED',resourceId:created.body.id,deleted:false,resource:{id:created.body.id}});expect(found.headers['cache-control']).toBe('private, no-store');
        await prisma.item.delete({where:{id:created.body.id}});const gone=await request(server).get(url).set('Authorization',auth(first));expect(gone.body).toMatchObject({state:'CREATED',resourceId:created.body.id,deleted:true,resource:null});expect((await copy(destination.id,first,key)).status).toBe(410);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
    });
    it('safely stops an unreceived original clone and prevents a delayed POST from creating anything',async()=>{
        const destination=await target(),key=randomUUID(),body={sourceItemId:itemId,targetWishlistId:destination.id};
        const stop=await request(server).post('/api/items/clone-receipts/'+key+'/abandon').set('Authorization',auth(first)).send(body);expect(stop.status).toBe(200);expect(stop.body).toMatchObject({state:'ABANDONED',resourceId:null,resource:null,deleted:false});
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});expect((await copy(destination.id,first,key)).status).toBe(410);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
        expect((await request(server).get(receiptUrl(key,destination.id)).set('Authorization',auth(first))).body.state).toBe('ABANDONED');
    });
    it('does not delete a created wish when stop is requested after commit',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(),key=randomUUID(),created=await copy(destination.id,first,key);expect(created.status).toBe(201);
        const stopped=await request(server).post('/api/items/clone-receipts/'+key+'/abandon').set('Authorization',auth(first)).send({sourceItemId:itemId,targetWishlistId:destination.id});expect(stopped.status).toBe(200);expect(stopped.body).toMatchObject({state:'CREATED',resourceId:created.body.id,deleted:false});expect(await prisma.item.findUnique({where:{id:created.body.id}})).not.toBeNull();
    });
    it('orders a simultaneous clone and stop by the same owner operation lock',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target(),key=randomUUID();
        const stop=request(server).post('/api/items/clone-receipts/'+key+'/abandon').set('Authorization',auth(first)).send({sourceItemId:itemId,targetWishlistId:destination.id});const [created,stopped]=await Promise.all([copy(destination.id,first,key),stop]);expect(stopped.status).toBe(200);
        expect(created.status).toBe(stopped.body.state==='CREATED'?201:410);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(stopped.body.state==='CREATED'?1:0);expect(await prisma.wishCreateReceipt.count({where:{userId:first,clientRequestId:key}})).toBe(1);
    });
    it.each(['private','hidden'])('rechecks %s source permissions after a proven database lock wait',async mode=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});await prisma.item.update({where:{id:itemId},data:{aiStatus:'SKIPPED'}});const destination=await target();
        let ready!:()=>void,unlock!:()=>void;const acquired=new Promise<void>(r=>{ready=r;}),held=new Promise<void>(r=>{unlock=r;});
        const change=prisma.$transaction(async tx=>{if(mode==='private')await tx.wishlist.update({where:{id:listId},data:{isPublic:false}});else await tx.item.update({where:{id:itemId},data:{isHidden:true}});ready();await held;});await acquired;
        const attempt=copy(destination.id).then(r=>r);
        try{let waiting=false;for(let n=0;n<50 && !waiting;n++){const rows=await prisma.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT "id" FROM %'`;waiting=rows[0].count>0;if(!waiting)await new Promise(r=>setTimeout(r,20));}expect(waiting).toBe(true);}finally{unlock();}
        await change;expect((await attempt).status).toBe(404);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
    });
    it('rejects in-flight source jobs instead of manufacturing a completed or stuck copied job',async()=>{
        await prisma.wishlist.update({where:{id:listId},data:{isPublic:true}});const destination=await target();
        for(const patch of [{aiStatus:'PROCESSING',uploadStatus:'COMPLETED'},{aiStatus:'COMPLETED',uploadStatus:'UPLOADING'}]){await prisma.item.update({where:{id:itemId},data:patch});expect((await copy(destination.id)).status).toBe(409);}expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
    });
    it('requires auth and rejects malformed clone IDs, targets, request identities and extra fields',async()=>{
        expect((await request(server).post('/api/items/'+itemId+'/clone').send({})).status).toBe(401);const destination=await target();
        for(const body of [{targetWishlistId:0},{targetWishlistId:[destination.id]},{targetWishlistId:destination.id,clientRequestId:'invalid'},{clientRequestId:randomUUID()},{targetWishlistId:destination.id,proxy_end_user_id:'injected'}])expect((await request(server).post('/api/items/'+itemId+'/clone').set('Authorization',auth(first)).send(body)).status).toBe(400);
        for(const value of ['0','1.2','2147483648'])expect((await request(server).post('/api/items/'+value+'/clone').set('Authorization',auth(first)).send({targetWishlistId:destination.id})).status).toBe(400);
    });
    it('refuses to reuse a native create identity for clone or stop',async()=>{
        const destination=await target(),key=randomUUID();await prisma.wishCreateReceipt.create({data:{userId:first,clientRequestId:key,kind:'ITEM',requestHash:'a'.repeat(64),resourceId:itemId}});
        expect((await copy(destination.id,first,key)).status).toBe(409);expect((await request(server).post('/api/items/clone-receipts/'+key+'/abandon').set('Authorization',auth(first)).send({sourceItemId:itemId,targetWishlistId:destination.id})).status).toBe(409);expect(await prisma.item.count({where:{wishlistId:destination.id}})).toBe(0);
    });
    it('acknowledges exact item deletion only after commit while preserving the old message',async()=>{
        const r=await request(server).delete('/api/items/'+itemId).set('Authorization',auth(owner));expect(r.status).toBe(200);expect(r.body).toEqual({message:'Item deleted',id:itemId,deleted:true});expect(r.headers['cache-control']).toBe('private, no-store');expect(await prisma.item.findUnique({where:{id:itemId}})).toBeNull();expect((await request(server).delete('/api/items/'+itemId).set('Authorization',auth(owner))).status).toBe(404);
    });
    it('denies outsider deletion and malformed IDs without changing the source',async()=>{
        expect((await request(server).delete('/api/items/'+itemId).set('Authorization',auth(first))).status).toBe(403);for(const value of ['0','1.2','2147483648'])expect((await request(server).delete('/api/items/'+value).set('Authorization',auth(owner))).status).toBe(400);expect(await prisma.item.findUnique({where:{id:itemId}})).not.toBeNull();
    });
    it('confirms legacy privacy for the same owner and list, preserving wishes and private no-store', async () => {
        const r = await request(server).put('/api/wishlists/' + listId).set('Authorization', auth(owner)).send({ isPublic: true });
        expect(r.status).toBe(200); expect(r.body).toMatchObject({ id: listId, userId: owner, isPublic: true }); expect(r.headers['cache-control']).toBe('private, no-store');
        expect(await prisma.item.count({ where: { wishlistId: listId } })).toBe(1);
        const lists = await request(server).get('/api/wishlists').set('Authorization', auth(owner)); expect(lists.status).toBe(200); expect(lists.headers['cache-control']).toBe('private, no-store'); expect(lists.body.map((row: { id: number }) => row.id)).toContain(listId);
    });
    it('denies outsider legacy privacy and deletion without changing the owner list', async () => {
        for (const method of ['put', 'delete'] as const) {
            const r = await request(server)[method]('/api/wishlists/' + listId).set('Authorization', auth(first)).send({ isPublic: true });
            expect(r.status).toBe(403); expect(r.headers['cache-control']).toBe('private, no-store');
        }
        expect(await prisma.wishlist.findUnique({ where: { id: listId } })).toMatchObject({ userId: owner, isPublic: false });
    });
    it('returns an additive exact deletion acknowledgment only after the transaction and retains the old message', async () => {
        const r = await request(server).delete('/api/wishlists/' + listId).set('Authorization', auth(owner));
        expect(r.status).toBe(200); expect(r.body).toEqual({ id: listId, deleted: true, message: 'Wishlist deleted successfully' }); expect(r.headers['cache-control']).toBe('private, no-store');
        expect(await prisma.wishlist.findUnique({ where: { id: listId } })).toBeNull(); expect(await prisma.item.findUnique({ where: { id: itemId } })).toBeNull();
        expect((await request(server).delete('/api/wishlists/' + listId).set('Authorization', auth(owner))).status).toBe(404);
    });
    it('requires authentication', async () => { expect((await request(server).put('/api/items/' + itemId).send({ isPurchased: true })).status).toBe(401); });
    it('defaults new wishlists to private, preserving an explicit public choice', async () => {
        const a = await request(server).post('/api/wishlists').set('Authorization', auth(owner)).send({ title: '新增合成願望' }); expect(a.status).toBe(201); expect(a.body.isPublic).toBe(false);
        const b = await request(server).post('/api/wishlists').set('Authorization', auth(owner)).send({ title: '新增合成公開願望', isPublic: true }); expect(b.status).toBe(201); expect(b.body.isPublic).toBe(true);
    });
    it('refuses outsider completion on a private wish, leaving DB state untouched', async () => {
        for (const isPurchased of [true, false]) expect((await edit({ isPurchased }, first)).status).toBe(403);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, purchasedById: null, maxPrice: 5000 });
    });
    it('refuses hidden public wishes', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await edit({ isPurchased: true }, first)).status).toBe(403);
    });
    it('denies falsy edits to public wishes as well as injected ownership fields', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        for (const extra of [{ notes: '' }, { price: null }, { isHidden: false }, { maxPrice: 0 }]) expect((await edit({ isPurchased: true, ...extra }, first)).status).toBe(403);
        expect((await edit({ purchasedById: first })).status).toBe(400);
    });
    it('preserves public gift fulfillment without sending private wish metadata in its acknowledgment', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        const claim = await edit({ isPurchased: true }, first); expect(claim.status).toBe(200); expect(claim.body).toEqual({ id: itemId, isPurchased: true }); expect(claim.headers['cache-control']).toBe('private, no-store');
        expect((await edit({ isPurchased: true }, first)).status).toBe(200);
        for (const isPurchased of [false, true]) expect((await edit({ isPurchased }, second)).status).toBe(409);
        expect((await edit({ isPurchased: false }, first)).status).toBe(200);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, purchasedById: null });
    });
    it('serializes concurrent claims: one fulfiller wins, the other cannot overwrite it', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        const attempts = await Promise.all([edit({ isPurchased: true }, first), edit({ isPurchased: true }, second)]); expect(attempts.map(r => r.status).sort()).toEqual([200, 409]);
        const winner = attempts[0].status === 200 ? first : second; expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: true, purchasedById: winner });
    });
    it('checks the committed privacy setting after waiting on the parent row lock', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        let ready!: () => void, unlock!: () => void; const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { unlock = resolve; });
        const change = prisma.$transaction(async tx => { await tx.wishlist.update({ where: { id: listId }, data: { isPublic: false } }); ready(); await held; });
        await acquired; const attempt = edit({ isPurchased: true }, first).then(r => r);
        try {
            let waiting = false;
            for (let n = 0; n < 50 && !waiting; n++) {
                const rows = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT "id" FROM "Wishlist" WHERE%'`;
                waiting = rows[0].count > 0;
                if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
            }
            expect(waiting).toBe(true); // Prove the HTTP transaction actually waited.
        } finally { unlock(); }
        await change; expect((await attempt).status).toBe(403);
    });
    it('permits explicit zero budgets, updates both currency fields separately, and clears editable values', async () => {
        const result = await edit({ maxPrice: 0, priceCurrency: 'twd', price: 0, currency: 'usd', notes: '', link: '' }); expect(result.status).toBe(200); expect(result.body).toMatchObject({ maxPrice: 0, priceCurrency: 'TWD', price: '0', currency: 'USD', notes: '', link: null });
        expect((await edit({ maxPrice: null, price: null, notes: null })).status).toBe(200); expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ maxPrice: null, priceCurrency: null, price: null, notes: null });
        expect((await edit({ priceCurrency: 'JPY' })).status).toBe(400); expect((await edit({ maxPrice: 10 })).body.priceCurrency).toBe('TWD');
    });
    it('rejects malformed booleans, unsafe links and invalid budgets without DB changes', async () => {
        for (const patch of [{ isPurchased: 'true' }, { link: 'javascript:alert(1)' }, { maxPrice: -1 }, { maxPrice: 'Infinity' }, { name: [] }]) expect((await edit(patch)).status).toBe(400);
        expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ isPurchased: false, name: 'Sony 相機', maxPrice: 5000 });
    });
    it('never returns private or hidden wishes in the anonymous public feed', async () => {
        const privateFeed = await request(server).get('/api/items/public'); expect(privateFeed.status).toBe(200); expect(privateFeed.body.some((v: { id: number }) => v.id === itemId)).toBe(false);
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } });
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await request(server).get('/api/items/public')).body.some((v: { id: number }) => v.id === itemId)).toBe(false);
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: false } });
        const feed = await request(server).get('/api/items/public'); const visible = feed.body.find((v: { id: number }) => v.id === itemId);
        expect(visible).toMatchObject({ id: itemId, name: 'Sony 相機', maxPrice: 5000, wishlist: { id: listId, isPublic: true } });
        expect(visible).not.toHaveProperty('proxy_end_user_id'); expect(visible).not.toHaveProperty('aiError'); expect(visible.wishlist).not.toHaveProperty('user'); expect(visible.wishlist).not.toHaveProperty('userId');
        expect(feed.headers['cache-control']).toBe('no-store');
    });
    it('allows the owner to read private and hidden wishes but denies outsider item-ID enumeration', async () => {
        const url = '/api/items/' + itemId;
        expect((await request(server).get(url)).status).toBe(401);
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(404);
        const own = await request(server).get(url).set('Authorization', auth(owner)); expect(own.status).toBe(200); expect(own.body).toMatchObject({ id: itemId, proxy_end_user_id: 'synthetic-private-reference' });
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(404);
        expect((await request(server).get(url).set('Authorization', auth(owner))).status).toBe(200);
    });
    it('returns only public display fields in an outsider item detail', async () => {
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true, description: 'parent description should not be in item detail' } });
        const visible = await request(server).get('/api/items/' + itemId).set('Authorization', auth(first)); expect(visible.status).toBe(200);
        expect(visible.body).not.toHaveProperty('proxy_end_user_id'); expect(visible.body).not.toHaveProperty('purchasedById'); expect(visible.body.wishlist).toEqual({ id: listId, title: '合成私密清單', isPublic: true });
        expect(visible.headers['cache-control']).toBe('private, no-store');
        for (const invalid of ['0', '-1', '1.5', '2147483648']) expect((await request(server).get('/api/items/' + invalid).set('Authorization', auth(first))).status).toBe(400);
    });
    it('filters hidden wishes and integration references from public wishlist details without changing owner reads', async () => {
        const url = '/api/wishlists/' + listId;
        expect((await request(server).get(url).set('Authorization', auth(first))).status).toBe(403);
        await prisma.wishlist.update({ where: { id: listId }, data: { isPublic: true } }); await prisma.item.update({ where: { id: itemId }, data: { isHidden: true } });
        const visible = await request(server).get(url).set('Authorization', auth(first)); expect(visible.status).toBe(200); expect(visible.body.items).toEqual([]);
        expect((await request(server).get(url).set('Authorization', auth(owner))).body.items).toHaveLength(1);
        await prisma.item.update({ where: { id: itemId }, data: { isHidden: false } });
        const unhidden = await request(server).get(url).set('Authorization', auth(first)); expect(unhidden.body.items).toHaveLength(1); expect(unhidden.body.items[0]).not.toHaveProperty('proxy_end_user_id');
    });
});
