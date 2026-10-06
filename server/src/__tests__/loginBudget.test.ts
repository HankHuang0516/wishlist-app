import express from 'express';
import request from 'supertest';
import { once } from 'node:events';
import { loginLimiter } from '../middleware/rateLimiter';
import { websiteRateLimits } from '../middleware/websiteRateLimits';
it('public saturation and successful sign-ins cannot consume the failed-login allowance', async () => {
 const app = express(); app.use(express.json()); app.use(...websiteRateLimits('/missing-build'));
 app.post('/api/auth/login', loginLimiter, (req, res) => res.status(req.body.password === 'synthetic-valid' ? 200 : 400).json({ ok: req.body.password === 'synthetic-valid' }));
 app.use((_req, res) => res.json({ ok: true }));
 const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
 try {
  for (let i = 0; i < 500; i++) expect((await request(server).get('/api/source-leads')).status).toBe(200);
  expect((await request(server).get('/api/source-leads')).status).toBe(429);
  for (let i = 0; i < 12; i++) expect((await request(server).post('/api/auth/login').send({ password: 'synthetic-valid' })).status).toBe(200);
  for (let i = 0; i < 10; i++) expect((await request(server).post('/api/auth/login').send({ password: 'synthetic-invalid' })).status).toBe(400);
  const blocked = await request(server).post('/api/auth/login').send({ password: 'synthetic-invalid' });
  expect(blocked.status).toBe(429); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
 } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 20000);
