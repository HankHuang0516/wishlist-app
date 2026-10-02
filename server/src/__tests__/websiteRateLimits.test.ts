import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { publicBuildPaths, websiteRateLimits } from '../middleware/websiteRateLimits';

let buildRoot: string;
beforeEach(() => {
  buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-build-budget-test-'));
  for (const directory of ['assets', 'icons', 'uploads', 'api']) fs.mkdirSync(path.join(buildRoot, directory));
  for (const file of ['index.html', 'web-version.json', 'sw.js', 'workbox-abc.js', 'assets/app-abc.js', 'icons/logo.png', 'uploads/private.png', 'api/profile.json', '.env', 'secret.txt']) fs.writeFileSync(path.join(buildRoot, file), 'synthetic fixture');
});
afterEach(() => fs.rmSync(buildRoot, { recursive: true, force: true }));
function app() {
  const instance = express();
  instance.use(...websiteRateLimits(buildRoot));
  instance.use((_req, res) => res.json({ ok: true }));
  return instance;
}

describe('published build and data request budgets', () => {
  it('admits only actual public build files, without following links or inventing missing assets', () => {
    fs.symlinkSync(path.join(buildRoot, '.env'), path.join(buildRoot, 'assets', 'linked.js'));
    const paths = publicBuildPaths(buildRoot);
    expect([...paths].sort()).toEqual(['/', '/assets/app-abc.js', '/icons/logo.png', '/index.html', '/sw.js', '/web-version.json', '/workbox-abc.js']);
    expect(publicBuildPaths(path.join(buildRoot, 'missing')).size).toBe(0);
  });
  it('keeps both original500/IP/15min budgets independent through actual HTTP saturation', async () => {
    const instance = app();
    for (let i = 0; i < 95; i++) expect((await request(instance).get('/assets/app-abc.js')).status).toBe(200);
    const firstRead = await request(instance).get('/api/users/me');
    expect(firstRead.headers['ratelimit-limit']).toBe('500'); expect(firstRead.headers['ratelimit-remaining']).toBe('499');
    for (let i = 1; i < 500; i++) expect((await request(instance).get('/api/chat/conversations')).status).toBe(200);
    const blocked = await request(instance).get('/api/users/me');
    expect(blocked.status).toBe(429); expect(blocked.body.errorCode).toBe('RATE_LIMIT_EXCEEDED'); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    const shell = await request(instance).get('/index.html');
    expect(shell.status).toBe(200); expect(shell.headers['ratelimit-remaining']).toBe('404');
    for (let i = 96; i < 500; i++) expect((await request(instance).get('/assets/app-abc.js')).status).toBe(200);
    expect((await request(instance).get('/sw.js')).status).toBe(429);
    expect((await request(instance).get('/api/users/me')).status).toBe(429);
  }, 15000);
  it('counts POST, private paths, unknown and encoded assets against data while allowing build HEAD', async () => {
    const instance = app();
    for (const resource of ['/uploads/private.png', '/api/users/me?file=/assets/app-abc.js', '/assets/missing.js', '/assets/%61pp-abc.js']) {
      expect((await request(instance).get(resource)).headers['ratelimit-remaining']).toBeDefined();
    }
    expect((await request(instance).post('/assets/app-abc.js')).headers['ratelimit-remaining']).toBe('495');
    expect((await request(instance).head('/assets/app-abc.js')).headers['ratelimit-remaining']).toBe('499');
    expect((await request(instance).get('/api/users/me')).headers['ratelimit-remaining']).toBe('494');
  });
});
