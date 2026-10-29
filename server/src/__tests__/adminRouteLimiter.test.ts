import express from 'express';
import request from 'supertest';
import { once } from 'events';
import { adminRequestBudget } from '../middleware/websiteRateLimits';
import { createSourceLeadAdmin } from '../routes/sourceLeadRoutes';

const KEY = 'synthetic-admin-route-key';
const probe = '/api/source-lead-admin/__limiter-probe__';

function build(withBudget: boolean) {
  const app = express();
  if (withBudget) app.use(adminRequestBudget(() => KEY));
  app.use('/api/source-lead-admin', createSourceLeadAdmin(() => KEY));
  return app;
}

describe('source lead admin per-minute limiter', () => {
  it('lets credential-verified admin requests past the 30/min burst cap', async () => {
    const server = build(true).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      for (let i = 0; i < 45; i++) {
        const res = await request(server).get(probe).set('x-admin-key', KEY);
        expect(res.status).not.toBe(429);
      }
    } finally { server.close(); }
  });

  it('keeps the 30/min cap, with an error code, when the request was not verified by the admin budget', async () => {
    const server = build(false).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      for (let i = 0; i < 30; i++) expect((await request(server).get(probe).set('x-admin-key', KEY)).status).not.toBe(429);
      const blocked = await request(server).get(probe).set('x-admin-key', KEY);
      expect(blocked.status).toBe(429);
      expect(blocked.body.errorCode).toBe('ADMIN_ROUTE_RATE_LIMIT');
    } finally { server.close(); }
  });
});
