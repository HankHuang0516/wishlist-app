import express from 'express';
import { createLoopbackRequest } from './loopbackHttp';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma';
import routes from '../../routes/listingRoutes';
import { managementBody, managementHash } from '../../lib/listingManagementOperation';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated DB URLs required');
const originalSecret = process.env.JWT_SECRET, secret = 'listing-management-isolated-only'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/listings', routes);
const isolatedHttp=createLoopbackRequest(app);
let users: number[] = [], listingId: string, ip = 0;
const http = (method: 'get' | 'post' | 'patch', path: string, user = users[0]) => isolatedHttp[method]('/api/listings' + path).set('Authorization', 'Bearer ' + jwt.sign({ id: user, authVersion: 0 }, secret)).set('X-Forwarded-For', `198.51.100.${++ip % 250 + 1}`);
const edit = () => managementBody({ kind: 'EDIT', listingId, expectedVersion: 1, changes: { title: '合成橘色二手檯燈', description: '隔離驗收，改為台幣320，不是真實商品。', price: 320 } });
const send = (id: string, body = edit(), user = users[0]) => http('post', '/management-operations/' + id, user).send(body);
const read = (id: string, user = users[0]) => http('get', '/management-operations/' + id, user);
const cancel = (id: string, body = edit()) => http('post', '/management-operations/' + id + '/abandon').send({ kind: body.kind, listingId: body.listingId, expectedVersion: body.expectedVersion, requestHash: managementHash(body) });
beforeAll(async () => {
  const run = randomUUID(); users = (await Promise.all(['owner', 'other'].map(role => prisma.user.create({ data: { phoneNumber: run + role, password: 'synthetic-unused', isEmailVerified: true }, select: { id: true } })))).map(u => u.id);
});
beforeEach(async () => {
  await prisma.listingManagementReceipt.deleteMany({ where: { userId: { in: users } } });
  await prisma.listingMedia.deleteMany({ where: { ownerUserId: { in: users } } }); await prisma.listing.deleteMany({ where: { ownerUserId: { in: users } } });
  await prisma.user.updateMany({ where: { id: { in: users } }, data: { authVersion: 0, apiKey: null } }); listingId = randomUUID();
  await prisma.listing.create({ data: { id: listingId, ownerUserId: users[0], clientListingId: randomUUID(), requestHash: randomUUID(), title: '合成橘色檯燈', description: '隔離商品原說明，非真實庫存。', condition: 'USED', category: 'home', price: 350, currency: 'TWD', deliveryMethods: ['MEETUP'], status: 'ACTIVE', version: 1, publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000),
    location: { create: { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 } },
    media: { create: { ownerUserId: users[0], imageUrl: 'https://example.invalid/image', thumbnailUrl: 'https://example.invalid/thumb', contentHash: 'synthetic-source' } } } });
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { try { if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } }); } finally { await prisma.$disconnect(); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; } });
describe('durable owner management receipts', () => {
  it('applies one edit atomically with a strict hash-only receipt and original-version evidence', async () => {
    const id = randomUUID(), first = await send(id); expect(first.status).toBe(200); expect(first.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(first.body)).toEqual(['receipt']); expect(Object.keys(first.body.receipt).sort()).toEqual(['clientActionId', 'listingId', 'kind', 'expectedVersion', 'requestHash', 'state', 'reason', 'appliedVersion', 'createdAt'].sort());
    expect(first.body.receipt).toMatchObject({ state: 'APPLIED', appliedVersion: 2, expectedVersion: 1, requestHash: managementHash(edit()), reason: null });
    expect(JSON.stringify(first.body)).not.toContain('合成橘色'); expect((await read(id)).body).toEqual(first.body); expect((await send(id)).body).toEqual(first.body); expect((await cancel(id)).body).toEqual(first.body);
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } }); expect(row.version).toBe(2); expect(row.price?.toString()).toBe('320');
    expect((await read(id, users[1])).status).toBe(404); expect((await send(randomUUID(), edit(), users[1])).status).toBe(404);
  });
  it('12 concurrent same-key retries increment the version once and return identical evidence', async () => {
    const id = randomUUID(), responses = await Promise.all(Array.from({ length: 12 }, () => send(id)));
    expect(responses.every(r => r.status === 200)).toBe(true); expect(new Set(responses.map(r => JSON.stringify(r.body))).size).toBe(1);
    expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(1); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(2);
  });
  it('same key cannot be repurposed for other content or another listing', async () => {
    const id = randomUUID(); await send(id);
    expect((await send(id, { ...edit(), changes: { ...edit().changes, price: 1 } })).status).toBe(409);
    expect((await send(id, { ...edit(), listingId: randomUUID() })).status).toBe(409); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(2);
  });
  it('status changes have immutable evidence after release and do not revert on original retry', async () => {
    const id = randomUUID(), body = managementBody({ kind: 'STATUS', listingId, expectedVersion: 1, changes: { action: 'reserve' } });
    const first = await send(id, body); expect(first.body.receipt.appliedVersion).toBe(2);
    expect((await send(randomUUID(), { ...body, expectedVersion: 2, changes: { action: 'release' } })).body.receipt.appliedVersion).toBe(3);
    expect((await send(id, body)).body).toEqual(first.body); expect((await read(id)).body).toEqual(first.body); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('ACTIVE');
  });
  it('extension records Taiwan day-end exactly and retry cannot extend or increment twice', async () => {
    const id = randomUUID(), body = managementBody({ kind: 'EXTEND', listingId, expectedVersion: 1, changes: { expiryDate: '2101-01-15' } });
    const first = await send(id, body); expect(first.status).toBe(200); expect(first.body.receipt.state).toBe('APPLIED'); expect((await send(id, body)).body).toEqual(first.body);
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } }); expect(row.version).toBe(2); expect(row.expiresAt?.toISOString()).toBe('2101-01-15T15:59:59.999Z'); expect(row.expiryMode).toBe('CUSTOM_DATE');
  });
  it('conflict is terminal, retains the newer listing and requires a new explicit key/version', async () => {
    const id = randomUUID(); await prisma.listing.update({ where: { id: listingId }, data: { version: 2, title: '較新商品內容' } });
    const first = await send(id); expect(first.body.receipt).toMatchObject({ state: 'CONFLICT', appliedVersion: null, reason: 'LISTING_CONFLICT' }); expect((await send(id)).body).toEqual(first.body);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).title).toBe('較新商品內容'); expect((await send(randomUUID(), { ...edit(), expectedVersion: 2 })).body.receipt.appliedVersion).toBe(3);
  });
  it('invalid current publication policy records CONFLICT without partial changes', async () => {
    const result = await send(randomUUID(), { ...edit(), changes: { ...edit().changes, description: '聯絡電話 0935065876' } });
    expect(result.body.receipt).toMatchObject({ state: 'CONFLICT', reason: 'INVALID_LISTING_INPUT' }); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(1);
  });
  it('missing GET is read-only; cancellation fences late submission, including after listing erasure', async () => {
    const id = randomUUID(), body = edit(); expect((await read(id)).status).toBe(404); expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(0);
    await prisma.listing.delete({ where: { id: listingId } }); const first = await cancel(id, body); expect(first.body.receipt.state).toBe('ABANDONED'); expect((await send(id, body)).body).toEqual(first.body);
    expect(await prisma.listing.count({ where: { id: listingId } })).toBe(0);
  });
  it('cancel/submit race returns one terminal receipt and no unreceipted mutation', async () => {
    const id = randomUUID(), responses = await Promise.all([send(id), cancel(id)]); expect(responses.every(r => r.status === 200)).toBe(true);
    const proof = (await read(id)).body.receipt; expect(['APPLIED', 'ABANDONED']).toContain(proof.state);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(proof.state === 'APPLIED' ? 2 : 1); expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(1);
  });
  it('receipt persistence failure rolls back the successful mutation', async () => {
    const transaction = prisma.$transaction.bind(prisma);
    jest.spyOn(prisma, '$transaction').mockImplementation(((fn: any, options: any) => transaction(async tx => fn(new Proxy(tx, { get(target, key) { if (key === 'listingManagementReceipt') return new Proxy(target.listingManagementReceipt, { get(model, name) { return name === 'create' ? () => { throw Error('synthetic receipt failure'); } : Reflect.get(model, name); } }); return Reflect.get(target, key); } })), options)) as any);
    expect((await send(randomUUID())).status).toBe(503); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(1); expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(0);
  });
  it('proof survives later editing and listing erasure without recreating or exposing the item', async () => {
    const id = randomUUID(), first = await send(id); await prisma.listing.update({ where: { id: listingId }, data: { title: '後續版本', version: 8 } }); expect((await send(id)).body).toEqual(first.body);
    await prisma.listing.delete({ where: { id: listingId } }); expect((await read(id)).body).toEqual(first.body); expect((await send(id)).body).toEqual(first.body); expect(await prisma.listing.count({ where: { id: listingId } })).toBe(0);
  });
  it.each(['submit', 'read', 'cancel'])('rechecks a revoked JWT inside the owner lock for %s', async mode => {
    const transaction = prisma.$transaction.bind(prisma); let once = true;
    jest.spyOn(prisma, '$transaction').mockImplementation(((fn: any, options: any) => { if (once) { once = false; return prisma.user.update({ where: { id: users[0] }, data: { authVersion: 1 } }).then(() => transaction(fn, options)); } return transaction(fn, options); }) as any);
    const id = randomUUID(), result = mode === 'read' ? await read(id) : mode === 'cancel' ? await cancel(id) : await send(id);
    expect(result.status).toBe(401); expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(0); expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).version).toBe(1);
  });
  it.each(['submit', 'read', 'cancel'])('rechecks a revoked API key inside the owner lock for %s', async mode => {
    const key='isolated-management-'+randomUUID();await prisma.user.update({where:{id:users[0]},data:{apiKey:key}});
    const transaction=prisma.$transaction.bind(prisma);let once=true;
    jest.spyOn(prisma,'$transaction').mockImplementation(((fn:any,options:any)=>{if(once){once=false;return prisma.user.update({where:{id:users[0]},data:{apiKey:null}}).then(()=>transaction(fn,options));}return transaction(fn,options);}) as any);
    const id=randomUUID(),body=edit(),path='/api/listings/management-operations/'+id+(mode==='cancel'?'/abandon':'');
    const req=isolatedHttp[mode==='read'?'get':'post'](path).set('X-API-Key',key).set('X-Forwarded-For',`198.51.100.${++ip%250+1}`);
    const result=mode==='read'?await req:await req.send(mode==='cancel'?{kind:body.kind,listingId:body.listingId,expectedVersion:body.expectedVersion,requestHash:managementHash(body)}:body);
    expect(result.status).toBe(401);expect(await prisma.listingManagementReceipt.count({where:{userId:users[0]}})).toBe(0);expect((await prisma.listing.findUniqueOrThrow({where:{id:listingId}})).version).toBe(1);
  });
  it('retains legacy Android/iOS response contracts and ownership rejection', async () => {
    const result = await http('patch', '/' + listingId).send({ expectedVersion: 1, title: '舊端修改的商品' }); expect(result.status).toBe(200); expect(result.body.version).toBe(2); expect(result.body.receipt).toBeUndefined();
    expect((await http('post', '/' + listingId + '/status', users[1]).send({ expectedVersion: 2, action: 'sold' })).status).toBe(404);
    expect((await http('post', '/' + listingId + '/status').send({ expectedVersion: 2, action: 'reserve' })).body.status).toBe('RESERVED');
  });
  it('rejects malformed requests before writing any receipt or item', async () => {
    for (const body of [{ ...edit(), token: 'synthetic' }, { ...edit(), expectedVersion: 0 }, { ...edit(), changes: { title: '\ud800' } }, { ...edit(), changes: { title: '合成', price: 0.001 } }]) expect((await http('post', '/management-operations/' + randomUUID()).send(body)).status).toBe(400);
    expect((await send('bad')).status).toBe(400); expect((await http('get', '/management-operations/' + randomUUID() + '?token=synthetic')).status).toBe(400);
    expect((await isolatedHttp.get('/api/listings/management-operations/' + randomUUID())).status).toBe(401); expect(await prisma.listingManagementReceipt.count({ where: { userId: users[0] } })).toBe(0);
  });
  it('database rejects unknown/NULL-incomplete terminal evidence and incorrect versions', async () => {
    const base = { userId: users[0], listingId, kind: 'EDIT', expectedVersion: 1, requestHash: 'a'.repeat(64), state: 'APPLIED', appliedVersion: 2 };
    for (const data of [{ ...base, appliedVersion: null }, { ...base, appliedVersion: 3 }, { ...base, state: 'CONFLICT', appliedVersion: null, reason: null }, { ...base, kind: 'OTHER' }, { ...base, state: 'ABANDONED' }]) await expect(prisma.listingManagementReceipt.create({ data: { ...data, clientActionId: randomUUID() } })).rejects.toThrow();
  });
});
