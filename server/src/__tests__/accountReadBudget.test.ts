import express, { RequestHandler } from 'express';
import request from 'supertest';
import { once } from 'node:events';
import { accountReadBudget, websiteRateLimits } from '../middleware/websiteRateLimits';
const auth: RequestHandler = (req, res, next) => {
  if (req.headers.authorization !== 'Bearer synthetic-verified') { res.status(401).json({ errorCode: 'INVALID_TOKEN' }); return; }
  (req as typeof req & { user: { id: number } }).user = { id: 42 }; next();
};
it('delegates only a verified worker image GET to the existing private-media lease guard', async () => {
 const prior = process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;
 const worker = 'synthetic-worker-capability-32-characters-long';
 process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = worker;
 const app = express(); app.use(accountReadBudget(auth));
 let processing = false;
 app.get('/api/listing-media/:id/image', (_req, res) => {
   if (!processing) { res.status(404).json({ errorCode: 'NO_ACTIVE_LEASE' }); return; }
   res.json({ user: res.locals.verifiedAccountRequest ?? false });
 });
 app.use((_req, res) => res.json({ ok: true }));
 const url = '/api/listing-media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/image';
 try {
  expect((await request(app).get(url).set('Authorization', 'Bearer '+worker)).status).toBe(404);
  processing = true;
  const read = await request(app).get(url).set('Authorization', 'Bearer '+worker);
  expect(read.status).toBe(200); expect(read.body.user).toBe(false);
  for (const [method, path] of [['get',url.replace('/image','/thumbnail')],['post',url],['get','/api/users/me']] as const)
    expect((await request(app)[method](path).set('Authorization','Bearer '+worker)).status).toBe(401);
  expect((await request(app).get(url).set('Authorization','Bearer forged')).status).toBe(401);
 } finally { if(prior===undefined)delete process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN;else process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN=prior; }
});
it('public saturation cannot block verified wishes, messages, reports, map controls or source inquiries', async () => {
 const app = express(); app.use(accountReadBudget(auth)); app.use(...websiteRateLimits('/missing-build'));
 app.use((_req, res) => res.json({ ok: true }));
 const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
 try {
  for (let i = 0; i < 500; i++) expect((await request(server).get('/api/source-leads')).status).toBe(200);
  expect((await request(server).get('/partners')).status).toBe(429);
  expect((await request(server).get('/api/users/me').set('Authorization', 'Bearer forged')).status).toBe(401);
  for (const path of ['/api/users/me', '/api/discovery/for-you', '/api/discovery', '/api/product-wishes', '/api/native-wishes/lists', '/api/listings/mine', '/api/chat/conversations', '/api/source-leads/synthetic/inquiry']) {
   expect((await request(server).get(path).set('Authorization', 'Bearer synthetic-verified')).status).toBe(200);
  }
  for (const [method, path] of [['post','/api/product-wishes'],['post','/api/discovery/cp-evaluations'],['post', '/api/chat/conversations/synthetic/reports'], ['put', '/api/listings/synthetic/map-presence'], ['post', '/api/chat/blocks/43'], ['delete', '/api/chat/blocks/43']] as const) {
   expect((await request(server)[method](path).set('Authorization', 'Bearer synthetic-verified')).status).toBe(200);
   expect((await request(server)[method](path).set('Authorization', 'Bearer forged')).status).toBe(401);
  }
  expect((await request(server).get('/api/internal/marketing/next').set('Authorization', 'Bearer synthetic-verified')).status).toBe(429);
  expect((await request(server).get('/api/chat/conversations').set('x-user-id', '42')).status).toBe(429);
 } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 20000);

it('bounds verified reads across IPs while preserving the separate write budget and Retry-After', async () => {
 const app = express(); app.set('trust proxy', 1); app.use(accountReadBudget(auth)); app.use((_req, res) => res.json({ ok: true }));
 const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
 try {
  for (let i = 0; i < 500; i++) expect((await request(server).get('/api/users/me').set('Authorization', 'Bearer synthetic-verified').set('X-Forwarded-For', '192.0.2.1')).status).toBe(200);
  const blocked = await request(server).get('/api/users/me').set('Authorization', 'Bearer synthetic-verified').set('X-Forwarded-For', '192.0.2.2');
  expect(blocked.status).toBe(429); expect(blocked.body.errorCode).toBe('ACCOUNT_READ_RATE_LIMIT'); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect((await request(server).get('/api/users/me').set('Authorization', 'Bearer forged')).status).toBe(401);
  expect((await request(server).post('/api/chat/blocks/43').set('Authorization', 'Bearer synthetic-verified')).status).toBe(200);
  for (let i = 1; i < 120; i++) expect((await request(server).post('/api/chat/blocks/43').set('Authorization', 'Bearer synthetic-verified')).status).toBe(200);
  const write = await request(server).post('/api/chat/blocks/43').set('Authorization', 'Bearer synthetic-verified');
  expect(write.status).toBe(429); expect(write.body.errorCode).toBe('ACCOUNT_WRITE_RATE_LIMIT'); expect(Number(write.headers['retry-after'])).toBeGreaterThan(0);
 } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 20000);
