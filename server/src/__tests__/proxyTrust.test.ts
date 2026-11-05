import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { configureProxyTrust, TRUSTED_PROXY_HOPS } from '../lib/proxyTrust';
import { websiteRateLimits } from '../middleware/websiteRateLimits';

const CLIENT_A = '198.51.100.11', CLIENT_B = '198.51.100.22', EDGE_1 = '192.0.2.1', EDGE_2 = '192.0.2.2';

function limited(limit = 100) {
  const app = express();
  configureProxyTrust(app);
  app.use(rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false }));
  app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips, protocol: req.protocol }));
  return app;
}
const via = (app: express.Express, chain: string) => request(app).get('/').set('X-Forwarded-For', chain);
const remaining = (res: request.Response) => Number(res.headers['ratelimit-remaining']);

describe('proxy trust for the Railway chain', () => {
  it('resolves req.ip to the client for the measured [client, edge] chain', async () => {
    expect(TRUSTED_PROXY_HOPS).toBe(2);
    expect((await via(limited(), `${CLIENT_A}, ${EDGE_1}`)).body.ip).toBe(CLIENT_A);
  });

  it('gives one client a single counter across edge nodes', async () => {
    const app = limited();
    const seen = [];
    for (const edge of [EDGE_1, EDGE_2, EDGE_1, EDGE_2]) seen.push(remaining(await via(app, `${CLIENT_A}, ${edge}`)));
    expect(seen).toEqual([99, 98, 97, 96]);
  });

  it('keeps clients behind one edge node on separate counters', async () => {
    const app = limited();
    expect(remaining(await via(app, `${CLIENT_A}, ${EDGE_1}`))).toBe(99);
    expect(remaining(await via(app, `${CLIENT_A}, ${EDGE_1}`))).toBe(98);
    expect(remaining(await via(app, `${CLIENT_B}, ${EDGE_1}`))).toBe(99);
  });

  it('blocks one client once its budget is spent, whichever edge node it uses, and leaves others alone', async () => {
    const app = limited(2);
    expect((await via(app, `${CLIENT_A}, ${EDGE_1}`)).status).toBe(200);
    expect((await via(app, `${CLIENT_A}, ${EDGE_2}`)).status).toBe(200);
    expect((await via(app, `${CLIENT_A}, ${EDGE_2}`)).status).toBe(429);
    expect((await via(app, `${CLIENT_B}, ${EDGE_2}`)).status).toBe(200);
  });

  it('still finds the client when a route carries no edge entry', async () => {
    expect((await via(limited(), CLIENT_A)).body.ip).toBe(CLIENT_A);
  });

  it('ignores extra entries a caller prepends, should the edge ever stop replacing them', async () => {
    const app = limited();
    expect(remaining(await via(app, `${CLIENT_A}, ${EDGE_1}`))).toBe(99);
    const forged = await via(app, `203.0.113.7, ${CLIENT_A}, ${EDGE_2}`);
    expect(forged.body.ip).toBe(CLIENT_A);
    expect(remaining(forged)).toBe(98);
  });

  it('still reads the forwarded protocol', async () => {
    const res = await via(limited(), `${CLIENT_A}, ${EDGE_1}`).set('X-Forwarded-Proto', 'https');
    expect(res.body.protocol).toBe('https');
  });

  it('applies to the real site-wide limiter', async () => {
    const app = express();
    configureProxyTrust(app);
    app.use(...websiteRateLimits(path.join(__dirname, 'no-such-build')));
    app.get('/api/probe', (_req, res) => res.json({ ok: true }));
    const hit = (chain: string) => request(app).get('/api/probe').set('X-Forwarded-For', chain);
    expect(remaining(await hit(`${CLIENT_A}, ${EDGE_1}`))).toBe(499);
    expect(remaining(await hit(`${CLIENT_A}, ${EDGE_2}`))).toBe(498);
    expect(remaining(await hit(`${CLIENT_B}, ${EDGE_2}`))).toBe(499);
  });

  it('is what the production server actually uses', () => {
    const source = fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8');
    expect(source).toContain('configureProxyTrust(app);');
    expect(source).not.toMatch(/app\.set\(\s*['"]trust proxy['"]/);
  });
});
