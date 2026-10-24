import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { createProductWishRoutes } from '../../routes/productWishRoutes';
import { createLoopbackRequest } from './loopbackHttp';
import { parseLead } from '../../lib/sourceLeadRules';
import { getApiUrl } from '../../config/constants';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Isolated test DB required');
const app = express(); app.use(express.json()); app.use('/wishes', createProductWishRoutes());
const http = createLoopbackRequest(app), key = randomUUID(), otherKey = randomUUID();
let buyer: number, other: number, seller: number, listId: number, productId: string;
const run = randomUUID(), sourceIds: string[] = [];
const originalSourceFlag = process.env.SOURCE_LEADS_PUBLIC_ENABLED;
const post = (body: object, credential = key) => http.post('/wishes').set('X-Api-Key', credential).send(body);
const input = (extra = {}) => ({ kind: 'listing', productId, wishlistId: listId, clientRequestId: randomUUID(), ...extra });
beforeAll(async () => {
  process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1';
  [buyer, other, seller] = await Promise.all([key, otherKey, randomUUID()].map((apiKey, i) => prisma.user.create({ data: { phoneNumber: `product-wish-${run}-${i}`, password: 'synthetic-only', apiKey }, select: { id: true } }).then(u => u.id)));
});
beforeEach(async () => {
  listId = (await prisma.wishlist.create({ data: { userId: buyer, title: '合成私人商品願望' } })).id;
  const mediaId = randomUUID();
  productId = (await prisma.listing.create({ data: { ownerUserId: seller, clientListingId: randomUUID(), requestHash: 'synthetic-only', title: '合成真實刊登資料', description: 'isolated fixture', category: 'electronics', price: 1200,
    status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), deliveryMethods: ['SHIPPING'], media: { create: { id: mediaId, ownerUserId: seller, contentHash: 'synthetic-no-file', imageUrl: getApiUrl() + '/listing-media/' + mediaId + '/image', thumbnailUrl: getApiUrl() + '/listing-media/' + mediaId + '/thumbnail' } } } })).id;
});
afterAll(async () => {
  if (originalSourceFlag === undefined) delete process.env.SOURCE_LEADS_PUBLIC_ENABLED; else process.env.SOURCE_LEADS_PUBLIC_ENABLED = originalSourceFlag;
  await prisma.externalSourceLead.deleteMany({ where: { id: { in: sourceIds } } });
  await prisma.listing.deleteMany({ where: { ownerUserId: seller } });
  await prisma.listingMedia.deleteMany({ where: { ownerUserId: seller } });
  await prisma.user.deleteMany({ where: { id: { in: [buyer, other, seller] } } });
  await prisma.$disconnect();
});
it('creates a real private Item with the public product name, photo and link, without setting an invented buyer budget', async () => {
  const body = input(), response = await post(body);
  expect(response.status).toBe(201);
  const wish = await prisma.item.findUniqueOrThrow({ where: { id: response.body.itemId } });
  expect(wish).toMatchObject({ name: '合成真實刊登資料', wishlistId: listId, price: '1200', currency: 'TWD', maxPrice: null, askPrice: null, aiStatus: 'SKIPPED', isHidden: false, isPurchased: false });
  expect(wish.link).toContain('/listings/' + productId);
  expect(wish.imageUrl).toContain('/thumbnail');
  const mine = await http.get('/wishes').set('X-Api-Key', key);
  expect(mine.body.saved).toContainEqual({ productKey: 'listing:' + productId, itemId: wish.id, wishlistId: listId });
  const theirs = await http.get('/wishes').set('X-Api-Key', otherKey);
  expect(theirs.body.saved).toEqual([]); expect(theirs.body.lists).toEqual([]);
});
it('serializes concurrent clicks and new request IDs into one wish; replays retain the same receipt', async () => {
  const body = input(), results = await Promise.all([post(body), post(body), post(input())]);
  expect(results.map(r => r.status)).toEqual([201, 201, 201]);
  expect(new Set(results.map(r => r.body.itemId)).size).toBe(1);
  expect(await prisma.item.count({ where: { wishlistId: listId } })).toBe(1);
  expect((await post({ ...body, productId: randomUUID() })).status).toBe(409);
});
it('requires ownership, respects list capacity, and never discloses another account receipt', async () => {
  expect((await http.post('/wishes').send(input())).status).toBe(401);
  expect((await post(input(), otherKey)).status).toBe(404);
  await prisma.wishlist.update({ where: { id: listId }, data: { maxItems: 0 } });
  expect((await post(input())).body.errorCode).toBe('WISHLIST_FULL');
  expect(await prisma.item.count({ where: { wishlistId: listId } })).toBe(0);
  await prisma.wishlist.update({ where: { id: listId }, data: { maxItems: 1 } });
  const body = input(); await post(body);
  expect((await http.get('/wishes/receipts/' + body.clientRequestId).set('X-Api-Key', otherKey)).status).toBe(404);
});
it('preserves a lost-ACK receipt after the product is withdrawn and after the created wish is deleted', async () => {
  const body = input(), first = await post(body);
  await prisma.listing.update({ where: { id: productId }, data: { status: 'REMOVED' } });
  expect((await post(body)).body.itemId).toBe(first.body.itemId);
  await prisma.item.delete({ where: { id: first.body.itemId } });
  const read = await http.get('/wishes/receipts/' + body.clientRequestId).set('X-Api-Key', key);
  expect(read.body).toMatchObject({ deleted: true, itemId: null, productKey: 'listing:' + productId });
  expect((await post(body)).body.deleted).toBe(true);
  expect(await prisma.item.count({ where: { wishlistId: listId } })).toBe(0);
});
it('refuses unavailable products and extra client-controlled snapshot fields', async () => {
  await prisma.listing.update({ where: { id: productId }, data: { status: 'DRAFT' } });
  expect((await post(input())).status).toBe(404);
  expect((await post(input({ title: 'forged' }))).status).toBe(400);
  expect(await prisma.item.count({ where: { wishlistId: listId } })).toBe(0);
});
it('copies an eligible public source reference into a real wish without presenting it as available inventory', async () => {
  const id = randomUUID(), canonicalUrl = `https://www.facebook.com/groups/123456789/posts/${id}`;
  const data = parseLead({ archiveItemId: 'SYNTHETIC-' + id, libraryFileId: 'libfile_' + 'a'.repeat(32), archiveVersion: 3, archiveSha256: 'a'.repeat(64), title: '來源線索：合成二手螢幕', summary: '來源參考，庫存與交易待確認。', canonicalUrl,
    county: '臺南市', district: '永康區', publicPlaceName: '合成公開面交點', publicAddress: '臺南市永康區合成路123號', latitude: 23, longitude: 120.236,
    postedEarliestAt: new Date(Date.now() - 86400000).toISOString(), postedLatestAt: new Date(Date.now() - 86400000).toISOString(), checkedAt: new Date().toISOString(), evidence: { sourceUrl: canonicalUrl, sourcePublic: true, publicSourceRef: 'self:synthetic-public', dateRef: 'self:synthetic-original-date', locationRef: 'self:synthetic-location', coordinateRef: 'self:synthetic-coordinate', locationSourceUrl: 'https://public.example.invalid/place/qa', coordinateSourceUrl: 'https://public.example.invalid/map/qa', publicPlace: true, locationType: 'PUBLIC_MEETING_POINT', sourceMeetingPointConfirmed: true, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'self:synthetic-review' } });
  const lead = await prisma.externalSourceLead.create({ data }); sourceIds.push(lead.id);
  const result = await post(input({ kind: 'source', productId: lead.id })); expect(result.status).toBe(201);
  const item = await prisma.item.findUniqueOrThrow({ where: { id: result.body.itemId } });
  expect(item).toMatchObject({ name: lead.title, link: canonicalUrl, price: null, maxPrice: null });
  expect(item.notes).toContain('庫存與交易條件待確認');
});

it('removes only the selected owned wish, replays removal without deleting a later re-add, and rejects stale item IDs',async()=>{
 const added=await post(input()),id=added.body.itemId;
 const removal=input({action:'REMOVE',expectedItemId:id});
 const removed=await post(removal);expect(removed.status).toBe(201);expect(removed.body).toMatchObject({action:'REMOVE',deleted:true,itemId:null,wishlistId:listId});
 expect(await prisma.item.findUnique({where:{id}})).toBeNull();
 const again=await post(input());expect(again.status).toBe(201);expect(again.body.itemId).not.toBe(id);
 expect((await post(removal)).body).toEqual(removed.body);
 expect(await prisma.item.findUnique({where:{id:again.body.itemId}})).not.toBeNull();
 expect((await post(input({action:'REMOVE',expectedItemId:id}))).status).toBe(409);
 expect((await post(input({action:'REMOVE',expectedItemId:again.body.itemId}),otherKey)).status).toBe(404);
 const otherList=await prisma.wishlist.create({data:{userId:buyer,title:'Second synthetic list'}});
 expect((await post(input({action:'REMOVE',expectedItemId:again.body.itemId,wishlistId:otherList.id}))).status).toBe(409);
});
