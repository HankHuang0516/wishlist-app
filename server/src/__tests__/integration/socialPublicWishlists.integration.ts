import express from 'express';
import { createServer } from 'http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import socialRoutes from '../../routes/socialRoutes';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Isolated test DB required');
const secret = 'social-public-wishlist-test-only'; process.env.JWT_SECRET = secret;
const app = express(); app.use(express.json()); app.use('/api/users', socialRoutes);
const server = createServer(app);
let owner: number, reader: number, publicId: number, privateId: number, visibleId: number, hiddenId: number;
const auth = () => 'Bearer ' + jwt.sign({ id: reader }, secret, { algorithm: 'HS256' });
const get = () => request(server).get(`/api/users/${owner}/wishlists`).set('Authorization', auth());
beforeAll(async () => {
 await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
 const run = randomUUID();
 const users = await Promise.all(['owner','reader'].map(role => prisma.user.create({ data: { phoneNumber: `social-privacy-${run}-${role}`, name: role, password: 'synthetic-only' }, select: { id: true } })));
 [owner, reader] = users.map(u => u.id);
 const pub = await prisma.wishlist.create({ data: { userId: owner, title: 'Synthetic public', isPublic: true, items: { create: [
  { name: 'Visible synthetic wish', notes: 'Public note', maxPrice: 500, priceCurrency: 'TWD', proxy_end_user_id: 'synthetic-internal', aiError: 'synthetic-diagnostic', originalUserId: owner, purchasedById: reader },
  { name: 'Hidden synthetic wish', notes: 'Hidden note', isHidden: true, proxy_end_user_id: 'synthetic-hidden' }
 ] } }, include: { items: true } });
 publicId = pub.id; visibleId = pub.items.find(i => !i.isHidden)!.id; hiddenId = pub.items.find(i => i.isHidden)!.id;
 privateId = (await prisma.wishlist.create({ data: { userId: owner, title: 'Synthetic private', items: { create: { name: 'Private wish' } } } })).id;
});
afterAll(async () => {
 await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
 if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner, reader] } } });
 await prisma.$disconnect();
});
describe('actual social route / public wishlist privacy', () => {
 it('never exposes private notification consent in user search or public wishes', async () => {
  await prisma.user.update({where:{id:owner},data:{marketingEmailsEnabled:true}});
  const fixture=await prisma.user.findUniqueOrThrow({where:{id:owner},select:{phoneNumber:true}});
  const r=await request(server).get('/api/users/search').query({query:fixture.phoneNumber}).set('Authorization',auth());
  expect(r.status).toBe(200);expect(r.body).toHaveLength(1);expect(r.body[0].id).toBe(owner);
  expect(r.body[0]).not.toHaveProperty('marketingEmailsEnabled');
  expect(JSON.stringify((await get()).body)).not.toContain('marketingEmailsEnabled');
 });
 it('requires a valid user session', async () => {
  expect((await request(server).get(`/api/users/${owner}/wishlists`)).status).toBe(401);
  expect((await request(server).get(`/api/users/${owner}/wishlists`).set('Authorization','Bearer invalid')).status).toBe(401);
 });
 it('preserves public visibility for a logged-in non-follower, excluding private lists and hidden items', async () => {
  const r = await get(); expect(r.status).toBe(200); expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.body.map((l: any) => l.id)).toEqual([publicId]); expect(r.body[0].items.map((i: any) => i.id)).toEqual([visibleId]);
  expect(r.body[0]._count.items).toBe(1); expect(JSON.stringify(r.body)).not.toContain('Hidden note');
  expect(r.body.map((l: any) => l.id)).not.toContain(privateId); expect(r.body[0].items.map((i: any) => i.id)).not.toContain(hiddenId);
 });
 it('returns only the explicit public DTO, never internal or identity fields', async () => {
  const r = await get(); expect(Object.keys(r.body[0]).sort()).toEqual(['id','title','description','isPublic','createdAt','updatedAt','items','_count'].sort());
  expect(Object.keys(r.body[0].items[0]).sort()).toEqual(['id','name','price','currency','askPrice','maxPrice','priceCurrency','link','imageUrl','notes','priority','isPurchased','createdAt','updatedAt'].sort());
  expect(r.body[0].items[0]).toMatchObject({ name: 'Visible synthetic wish', notes: 'Public note', maxPrice: 500, priceCurrency: 'TWD' });
 });
 it('keeps a public list with zero visible items and reports zero visible count', async () => {
  await prisma.item.update({ where: { id: visibleId }, data: { isHidden: true } });
  try { const r = await get(); expect(r.status).toBe(200); expect(r.body[0]).toMatchObject({ id: publicId, items: [], _count: { items: 0 } }); }
  finally { await prisma.item.update({ where: { id: visibleId }, data: { isHidden: false } }); }
 });
 it('returns an empty collection for an unknown target', async () => {
  const r = await request(server).get('/api/users/2147483647/wishlists').set('Authorization',auth()); expect(r.status).toBe(200); expect(r.body).toEqual([]);
 });
});
