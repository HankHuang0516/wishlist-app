import express from 'express';
import request from 'supertest';
import { addressClass, PROXY_DIAG_RUNTIME_MS, proxyChainDiagnostics } from '../middleware/proxyChainDiagnostics';

function harness() {
  const lines: string[] = [];
  let now = 1_000_000;
  const app = express();
  app.set('trust proxy', 1);
  app.use(proxyChainDiagnostics({ log: line => lines.push(line), clock: () => now }));
  app.get('/', (req, res) => res.json({ ip: req.ip, headers: Object.keys(res.getHeaders()) }));
  return { app, lines, advance: (ms: number) => { now += ms; } };
}

const CLIENT_A = '198.51.100.11', CLIENT_B = '198.51.100.22', HOP_1 = '192.0.2.1', HOP_2 = '192.0.2.2';
const hit = (app: express.Express, client: string, hop: string) => request(app).get('/').set('X-Forwarded-For', `${client}, ${hop}`).set('X-Real-IP', client);

describe('temporary proxy chain diagnostics', () => {
  it('reports sharing and splitting using counts alone', async () => {
    const { app, lines, advance } = harness();
    await hit(app, CLIENT_A, HOP_1);
    await hit(app, CLIENT_A, HOP_2);
    await hit(app, CLIENT_B, HOP_1);
    advance(61_000);
    await hit(app, CLIENT_B, HOP_1);
    expect(lines).toHaveLength(1);
    const report = JSON.parse(lines[0].replace('[proxy-chain-diag] ', ''));
    expect(report.requests).toBe(4);
    expect(report.xffEntries).toEqual({ 2: 4 });
    expect(report.agreement).toEqual({ 'reqIp=rightmost': 4, 'leftmost=realIp': 4, 'secondFromRight=realIp': 4 });
    expect(report.keysPerClient.reqIp).toMatchObject({ distinct: 2, worst: 2 });
    expect(report.clientsPerKey.reqIp).toMatchObject({ distinct: 2, worst: 2 });
    expect(report.keysPerClient.realIp).toMatchObject({ distinct: 2, worst: 1 });
    expect(report.clientsPerKey.realIp).toMatchObject({ distinct: 2, worst: 1 });
  });

  it('never logs an address or a hash', async () => {
    const { app, lines, advance } = harness();
    await hit(app, CLIENT_A, HOP_1);
    advance(61_000);
    await hit(app, CLIENT_B, HOP_2);
    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const address of [CLIENT_A, CLIENT_B, HOP_1, HOP_2]) expect(output).not.toContain(address);
    expect(output).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(output).not.toMatch(/[A-Za-z0-9+/]{32,}={0,2}/);
  });

  it('counts a forged sentinel without trusting it', async () => {
    const { app, lines, advance } = harness();
    await request(app).get('/').set('X-Forwarded-For', '203.0.113.7').set('X-Real-IP', '203.0.113.8');
    advance(61_000);
    await hit(app, CLIENT_A, HOP_1);
    expect(JSON.parse(lines[0].replace('[proxy-chain-diag] ', '')).sentinel).toEqual({ inXff: 1, xffLeftmost: 1, realIp: 1, reqIp: 1 });
  });

  it('leaves the response alone and stops by itself', async () => {
    const { app, lines, advance } = harness();
    const before = await hit(app, CLIENT_A, HOP_1);
    expect(before.status).toBe(200);
    expect(before.body.ip).toBe(HOP_1);
    advance(PROXY_DIAG_RUNTIME_MS);
    await hit(app, CLIENT_A, HOP_1);
    expect(lines[lines.length - 1]).toBe('[proxy-chain-diag] stopped');
    const count = lines.length;
    advance(PROXY_DIAG_RUNTIME_MS);
    expect((await hit(app, CLIENT_B, HOP_2)).status).toBe(200);
    expect(lines).toHaveLength(count);
  });

  it('classifies addresses without exposing them', () => {
    expect(addressClass('')).toBe('none');
    expect(addressClass('100.64.0.2')).toBe('cgnat-100.64/10');
    expect(addressClass('100.1.2.3')).toBe('100-other');
    expect(addressClass('10.0.0.1')).toBe('private');
    expect(addressClass('172.20.0.1')).toBe('private');
    expect(addressClass('8.8.8.8')).toBe('public');
    expect(addressClass('2001:db8::1')).toBe('v6-public');
    expect(addressClass('fd00::1')).toBe('v6-private');
    expect(addressClass('::1')).toBe('loopback');
  });
});
