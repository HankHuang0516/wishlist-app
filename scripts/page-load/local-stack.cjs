#!/usr/bin/env node
'use strict';
/* Local, isolated copy of the site for the page-load budget check.
 *
 * 1. Seeds an isolated test database with synthetic accounts and a public
 *    catalogue the size of production's.
 * 2. Starts the real server build (API + web build) with no provider, admin or
 *    signing credentials.
 * 3. Puts a delay proxy in front of it that adds the round trip measured between
 *    Taiwan and the production region to every request.
 * 4. Signs a synthetic account in and runs page-load-budget.cjs, first signed
 *    out and then signed in.
 *
 * Nothing here can reach production: the database must be a local
 * wishlist_marketplace_test_* database and the child process gets a fixed
 * environment instead of this shell's.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const http2 = require('node:http2');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { assertTestDatabase } = require('../assert-test-database.cjs');

const root = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parse(argv) {
  const values = { leads: '5500', wishes: '12', latency: '190', 'server-port': '18990', 'proxy-port': '18991', out: '', seed: 'fresh', hold: false, passes: 'guest,signed-in', modes: 'cold,warm,spa' };
  const rest = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--') { rest.push(...argv.slice(index + 1)); break; }
    const name = argv[index].replace(/^--/, '');
    if (!(name in values)) throw new Error('Unknown option: ' + argv[index]);
    if (typeof values[name] === 'boolean') values[name] = true; else values[name] = argv[++index];
  }
  const number = (name, min, max) => { const value = Number(values[name]); if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid --' + name); return value; };
  if (!['fresh', 'keep'].includes(values.seed)) throw new Error('--seed must be fresh or keep');
  return { leads: number('leads', 0, 60000), wishes: number('wishes', 2, 100), latency: number('latency', 0, 5000), serverPort: number('server-port', 1024, 65535), proxyPort: number('proxy-port', 1024, 65535),
    out: values.out || path.join(process.cwd(), 'page-load-results', 'local-' + new Date().toISOString().replace(/[:.]/g, '-')), seed: values.seed, hold: values.hold,
    passes: values.passes.split(',').filter(Boolean), modes: values.modes.split(',').filter(Boolean), harness: rest };
}

// ---- synthetic data ----------------------------------------------------------
const MARK = '@page-load.qa.invalid';
const catalogue = [
  ['Apple MacBook Air 13 吋 M1 8GB 256GB（二手）', 18500], ['Sony WH-1000XM4 無線降噪耳機（二手）', 4200], ['Nintendo Switch OLED 主機 白色（二手）', 6800],
  ['IKEA 書桌 120x60 白色（二手）', 900], ['Dyson V8 無線吸塵器（二手）', 5200], ['兒童繪本套書 20 本（二手）', 600], ['Uniqlo 羽絨外套 男 L（二手）', 750],
  ['登山背包 45L 含防水套（二手）', 1300], ['Canon EOS M50 單眼相機含鏡頭（二手）', 9800], ['樂高 10283 發現號太空梭（二手）', 4300], ['電子鍋 六人份（二手）', 500],
  ['寵物外出提籠 中型（二手）', 450], ['保養品旅行組 未拆封', 380], ['機械式鍵盤 青軸 中文注音（二手）', 1200], ['公路自行車 鋁合金 S 號（二手）', 7600],
];
const counties = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '新竹市', '基隆市'];

function leadInput(index, rules, now) {
  const [name, price] = catalogue[index % catalogue.length];
  const county = counties[index % counties.length], point = rules.countyIllustration(county);
  const url = 'https://www.facebook.com/groups/9000000001/posts/' + (7000000000 + index);
  const posted = new Date(now.getTime() - (1 + (index % 20)) * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    archiveItemId: 'PL' + String(index).padStart(6, '0'), libraryFileId: null, archiveVersion: null, archiveSha256: null,
    title: name.slice(0, 80) + ' ' + String(index + 1), summary: '頁面載入檢查用的合成公開來源，不是真實商品。', canonicalUrl: url,
    county, district: rules.UNKNOWN_SOURCE_DISTRICT, publicPlaceName: county + '概略示意位置', publicAddress: county + '（' + rules.COUNTY_ILLUSTRATION_LABEL + '）',
    latitude: point.latitude, longitude: point.longitude, postedEarliestAt: posted, postedLatestAt: posted, checkedAt: new Date(now.getTime() - 60_000).toISOString(),
    evidence: {
      sourceUrl: url, sourcePublic: true, publicSourceRef: 'source:page-load/' + index, dateRef: 'source:page-load-date/' + index,
      locationRef: 'source:page-load-location/' + index, coordinateRef: 'source:page-load-coordinate/' + index,
      locationSourceUrl: url, coordinateSourceUrl: rules.COUNTY_ILLUSTRATION_SOURCE, publicPlace: false, locationType: 'COUNTY_ILLUSTRATION',
      sourceMeetingPointConfirmed: false, independentlyReviewed: true, selfWrittenSummary: true, noCopiedTextOrImages: true, noPrivateData: true,
      reviewRef: 'review:page-load', sourceCheckRef: 'source:page-load-check/' + index,
      countyIllustration: { county, sourceUrl: url, sourceCountyRef: 'source:page-load-county/' + index, representativeKey: point.key, approvalRef: 'review:page-load-county', districtStatus: 'UNKNOWN' },
      publicFacts: { priceText: 'NT$ ' + (price + (index % 7) * 10), priceUnitStatus: 'unknown', currencyStatus: 'TWD', sourceAccessNotice: '合成公開來源，僅供頁面載入檢查。',
        originalDateLabel: '合成刊登時間 ' + posted, locationRelation: '概略位置，非取貨點。', coordinateQualityNotes: [] },
    },
  };
}

async function seed(database, leads, wishCount) {
  const { PrismaClient } = require(path.join(root, 'server/node_modules/@prisma/client'));
  const bcrypt = require(path.join(root, 'server/node_modules/bcryptjs'));
  const leadRules = require(path.join(root, 'server/dist/lib/sourceLeadRules'));
  const county = require(path.join(root, 'server/dist/lib/sourceCountyIllustration'));
  const rules = { ...county };
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    // Remove only what an earlier run of this script created.
    await db.externalSourceLead.deleteMany({ where: { archiveItemId: { startsWith: 'PL' }, summary: '頁面載入檢查用的合成公開來源，不是真實商品。' } });
    const earlier = (await db.user.findMany({ where: { email: { endsWith: MARK } }, select: { id: true } })).map(user => user.id);
    if (earlier.length) {
      await db.follow.deleteMany({ where: { OR: [{ followerId: { in: earlier } }, { followingId: { in: earlier } }] } });
      await db.conversation.deleteMany({ where: { OR: [{ buyerUserId: { in: earlier } }, { sellerUserId: { in: earlier } }] } });
      await db.user.deleteMany({ where: { id: { in: earlier } } });
    }
    const password = 'Pl' + randomBytes(16).toString('hex') + '9a', hash = await bcrypt.hash(password, 10);
    const people = {};
    for (const [role, name] of [['viewer', 'QA 買家'], ['seller', 'QA 賣家'], ['friend', 'QA 朋友']])
      people[role] = await db.user.create({ data: { phoneNumber: 'page-load-' + role, email: role + MARK, password: hash, name, isEmailVerified: true }, select: { id: true, email: true } });
    const wishes = [];
    const second = Math.min(4, wishCount - 1);
    for (const [owner, title, isPublic, count] of [[people.viewer, '生日願望', true, wishCount - second], [people.viewer, '私人清單', false, second], [people.friend, '朋友的願望', true, 5]]) {
      const list = await db.wishlist.create({ data: { userId: owner.id, title, isPublic } });
      wishes.push(list);
      for (let index = 0; index < count; index++) await db.item.create({ data: { wishlistId: list.id, name: catalogue[(index * 3) % catalogue.length][0].replace('（二手）', '') + (index >= catalogue.length ? ' ' + (index + 1) : ''), maxPrice: catalogue[(index * 3) % catalogue.length][1], priceCurrency: 'TWD', aiStatus: 'COMPLETED', originalUserId: owner.id } });
    }
    await db.follow.createMany({ data: [{ followerId: people.viewer.id, followingId: people.seller.id }, { followerId: people.viewer.id, followingId: people.friend.id }, { followerId: people.friend.id, followingId: people.viewer.id }] });
    const now = new Date(), listings = [];
    for (let index = 0; index < 12; index++) {
      const [title, price] = catalogue[index];
      listings.push(await db.listing.create({ data: { ownerUserId: people.seller.id, clientListingId: randomUUID(), requestHash: 'page-load-' + index, title: title.replace('（二手）', '') + '（站內）', description: '頁面載入檢查用的合成商品，不是真實販售。',
        category: 'electronics', condition: 'USED', price, currency: 'TWD', deliveryMethods: ['MEETUP'], status: 'ACTIVE', publishedAt: now, expiresAt: new Date(now.getTime() + 20 * 86400_000), lastVerifiedAt: now,
        mapVisibleUntil: new Date(now.getTime() + 86400_000), location: { create: { county: '臺北市', district: '中山區', publicLatitude: 25.0523 + index * 0.001, publicLongitude: 121.5234 + index * 0.001 } } }, select: { id: true } }));
    }
    for (let index = 0; index < 3; index++) await db.listing.create({ data: { ownerUserId: people.viewer.id, clientListingId: randomUUID(), requestHash: 'page-load-own-' + index, title: '我的二手商品 ' + (index + 1), description: '頁面載入檢查用的合成商品。',
      category: 'home', condition: 'USED', price: 300 + index * 50, currency: 'TWD', deliveryMethods: ['MEETUP'], status: 'ACTIVE', publishedAt: now, expiresAt: new Date(now.getTime() + 20 * 86400_000), lastVerifiedAt: now,
      location: { create: { county: '新北市', district: '板橋區', publicLatitude: 25.0123, publicLongitude: 121.4624 } } } });
    const conversations = [];
    for (let room = 0; room < 3; room++) {
      const conversation = await db.conversation.create({ data: { listingId: listings[room].id, buyerUserId: people.viewer.id, sellerUserId: people.seller.id,
        participants: { create: [{ userId: people.viewer.id, role: 'BUYER' }, { userId: people.seller.id, role: 'SELLER' }] } }, select: { id: true } });
      for (let sequence = 1; sequence <= 20; sequence++) await db.message.create({ data: { conversationId: conversation.id, senderUserId: sequence % 2 ? people.viewer.id : people.seller.id, clientMessageId: randomUUID(), sequence, text: '合成對話訊息 ' + sequence } });
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageSequence: 20, lastMessageAt: new Date(now.getTime() - room * 60_000) } });
      await db.conversationParticipant.updateMany({ where: { conversationId: conversation.id }, data: { lastReadSequence: 20 } });
      conversations.push(conversation.id);
    }
    let firstLead = null;
    for (let start = 0; start < leads; start += 500) {
      const rows = [];
      for (let index = start; index < Math.min(leads, start + 500); index++) {
        const id = randomUUID(), data = leadRules.parseLead(leadInput(index, rules, now), now, true);
        if (!firstLead) firstLead = id;
        rows.push({ id, ...data, recordOrigin: 'DB_MASTER', status: 'PUBLISHED' });
      }
      await db.externalSourceLead.createMany({ data: rows });
    }
    if (leads) {
      const sample = await db.externalSourceLead.findFirst({ where: { id: firstLead } });
      if (!leadRules.leadCurrent(sample, new Date())) throw new Error('Seeded source reference is not publicly current; fixture needs review');
    }
    return { password, people, vars: { listingId: listings[0].id, sellerId: String(people.seller.id), friendId: String(people.friend.id), wishlistId: String(wishes[0].id), friendWishlistId: String(wishes[2].id), sourceId: firstLead || '00000000-0000-4000-8000-000000000000', conversationId: conversations[0] } };
  } finally { await db.$disconnect(); }
}

async function existingVars(database) {
  const { PrismaClient } = require(path.join(root, 'server/node_modules/@prisma/client'));
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const find = role => db.user.findFirst({ where: { email: role + MARK }, select: { id: true, email: true } });
    const people = { viewer: await find('viewer'), seller: await find('seller'), friend: await find('friend') };
    if (!people.viewer || !people.seller || !people.friend) throw new Error('No earlier fixture to keep; run with --seed fresh');
    const listing = await db.listing.findFirst({ where: { ownerUserId: people.seller.id }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const wishlist = await db.wishlist.findFirst({ where: { userId: people.viewer.id }, orderBy: { id: 'asc' } }), friendList = await db.wishlist.findFirst({ where: { userId: people.friend.id } });
    const lead = await db.externalSourceLead.findFirst({ where: { archiveItemId: { startsWith: 'PL' } }, orderBy: { archiveItemId: 'asc' }, select: { id: true } });
    const conversation = await db.conversation.findFirst({ where: { buyerUserId: people.viewer.id }, select: { id: true } });
    // A kept fixture gets a new password so nothing has to be stored between runs.
    const bcrypt = require(path.join(root, 'server/node_modules/bcryptjs'));
    const password = 'Pl' + randomBytes(16).toString('hex') + '9a';
    await db.user.updateMany({ where: { email: { endsWith: MARK } }, data: { password: await bcrypt.hash(password, 10) } });
    return { password, people, vars: { listingId: listing.id, sellerId: String(people.seller.id), friendId: String(people.friend.id), wishlistId: String(wishlist.id), friendWishlistId: String(friendList.id), sourceId: lead ? lead.id : '00000000-0000-4000-8000-000000000000', conversationId: conversation.id } };
  } finally { await db.$disconnect(); }
}

// ---- server and delay proxy --------------------------------------------------
function startServer(database, port, base, secret) {
  // A fixed environment: no Railway, admin, provider, mail or signing values.
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', NODE_ENV: 'production', TZ: 'Asia/Taipei', PORT: String(port), DATABASE_URL: database, TEST_DATABASE_URL: database,
    JWT_SECRET: secret, CLIENT_URL: base, API_URL: base + '/api', SOURCE_LEADS_PUBLIC_ENABLED: '1' };
  const child = spawn(process.execPath, [path.join(root, 'server/dist/index.js')], { cwd: path.join(root, 'server'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  const keep = chunk => { log.push(String(chunk)); if (log.length > 400) log.shift(); };
  child.stdout.on('data', keep); child.stderr.on('data', keep);
  return { child, log };
}

// Production answers over HTTP/2, where a page's requests travel side by side.
// A throwaway certificate lets the browser use HTTP/2 here too; it never leaves
// this machine and is deleted with the run's temporary folder.
function certificate(folder) {
  const key = path.join(folder, 'key.pem'), cert = path.join(folder, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

function startProxy(port, target, latency, credentials) {
  let served = 0;
  const server = http2.createSecureServer({ ...credentials, allowHTTP1: true }, (request, response) => {
    served++;
    // A new client address every 200 requests, as separate visitors would have.
    const client = '10.20.' + (Math.floor(served / 200) % 250) + '.7';
    const headers = {};
    for (const [name, value] of Object.entries(request.headers)) if (!name.startsWith(':') && name !== 'connection') headers[name] = value;
    headers.host = request.headers[':authority'] || request.headers.host || '127.0.0.1:' + port;
    headers['x-forwarded-for'] = client + ', 10.30.0.1'; headers['x-forwarded-proto'] = 'https';
    const forward = () => {
      const upstream = http.request({ host: '127.0.0.1', port: target, method: request.method, path: request.url, headers }, reply => {
        const out = {};
        for (const [name, value] of Object.entries(reply.headers)) if (!['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection'].includes(name)) out[name] = value;
        response.writeHead(reply.statusCode || 502, out);
        reply.pipe(response);
      });
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.pipe(upstream);
    };
    if (latency) setTimeout(forward, latency); else forward();
  });
  const sessions = new Set();
  server.on('session', session => { sessions.add(session); session.on('close', () => sessions.delete(session)); });
  server.shutdown = () => new Promise(resolve => { for (const session of sessions) session.destroy(); server.close(() => resolve()); setTimeout(resolve, 2000); });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}

async function waitFor(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return; } catch { /* Not listening yet. */ }
    await sleep(250);
  }
  throw new Error('The local server did not start');
}

// The public catalogue read model is built in the background after a start. Until
// it is complete the server answers from the full scan, so wait for it; a build
// without the read model has no such table and is measured as it is.
async function waitForCatalog(database) {
  const { PrismaClient } = require(path.join(root, 'server/node_modules/@prisma/client'));
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  try {
    const [table] = await db.$queryRawUnsafe(`SELECT to_regclass('"PublicCatalogState"') IS NOT NULL AS "present"`);
    if (!table.present) return 'no read model in this build';
    for (let attempt = 0; attempt < 600; attempt++) {
      // Built, and the changes this run's seeding just made have been absorbed.
      const [state] = await db.$queryRawUnsafe(`SELECT "readyAt", (SELECT count(*)::int FROM "PublicCatalogDirty") AS "pending" FROM "PublicCatalogState" WHERE "id" = 1`);
      if (state && state.readyAt && !state.pending) return 'read model ready';
      await sleep(500);
    }
    return 'read model NOT ready after 5 minutes; measuring the full scan';
  } finally { await db.$disconnect(); }
}

function runHarness(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, 'page-load-budget.cjs'), ...args], { stdio: 'inherit', env: process.env });
    child.on('exit', code => resolve(code ?? 2));
  });
}

async function main() {
  const options = parse(process.argv.slice(2));
  const database = process.env.TEST_DATABASE_URL;
  assertTestDatabase(database);
  for (const file of ['server/dist/index.js', 'client/dist/index.html']) if (!fs.existsSync(path.join(root, file))) throw new Error('Build first: ' + file + ' is missing');
  fs.mkdirSync(options.out, { recursive: true });
  const base = 'https://127.0.0.1:' + options.proxyPort;
  console.log(options.seed === 'fresh' ? `Seeding ${options.leads} public source references, ${options.wishes} wishes and three synthetic accounts…` : 'Keeping the earlier fixture…');
  const fixture = options.seed === 'fresh' ? await seed(database, options.leads, options.wishes) : await existingVars(database);
  const varsFile = path.join(options.out, 'vars.json');
  fs.writeFileSync(varsFile, JSON.stringify(fixture.vars, null, 1));
  const secrets = fs.mkdtempSync(path.join(os.tmpdir(), 'page-load-session-'));
  const sessionFile = path.join(secrets, 'session.json');
  // One signing secret for the whole run, so a restart keeps the synthetic session valid.
  const secret = randomBytes(32).toString('hex');
  let server = null, proxy, status = 0;
  const halt = async () => {
    if (server && server.child.exitCode === null) { server.child.kill('SIGTERM'); await Promise.race([new Promise(resolve => server.child.once('exit', resolve)), sleep(5000)]); }
    server = null;
  };
  // Request budgets live in the server's memory. A fresh process per pass keeps
  // one pass from spending the next one's budget; the budgets themselves stay on.
  const boot = async () => {
    await halt();
    server = startServer(database, options.serverPort, base, secret);
    await waitFor('http://127.0.0.1:' + options.serverPort + '/web-version.json').catch(error => { throw new Error(error.message + '\n' + server.log.slice(-15).join('')); });
  };
  try {
    await boot();
    proxy = await startProxy(options.proxyPort, options.serverPort, options.latency, certificate(secrets));
    // This process talks to its own proxy only; the browser is told separately.
    const local = new (require('node:https').Agent)({ rejectUnauthorized: false });
    const post = (route, payload) => new Promise((resolve, reject) => {
      const request = require('node:https').request(base + route, { method: 'POST', agent: local, headers: { 'Content-Type': 'application/json' } }, reply => {
        let text = ''; reply.setEncoding('utf8'); reply.on('data', chunk => { text += chunk; });
        reply.on('end', () => { try { resolve({ status: reply.statusCode, body: JSON.parse(text) }); } catch { resolve({ status: reply.statusCode, body: null }); } });
      });
      request.on('error', reject); request.end(JSON.stringify(payload));
    });
    const login = await post('/api/auth/login', { phoneNumber: fixture.people.viewer.email, password: fixture.password });
    const body = login.body;
    if (login.status !== 200 || !body || typeof body.token !== 'string' || !body.user) throw new Error('The synthetic account could not sign in (HTTP ' + login.status + ')');
    fs.writeFileSync(sessionFile, JSON.stringify({ 'wishlist.auth.session.v1': JSON.stringify({ version: 1, api: base + '/api', token: body.token, user: body.user }) }), { mode: 0o600 });
    console.log(`Local site ready at ${base} (+${options.latency} ms per request, ${options.leads} public references; ${await waitForCatalog(database)})`);
    if (options.hold) { console.log('Holding; press Ctrl+C to stop.'); await new Promise(resolve => process.once('SIGINT', resolve)); return; }
    const common = ['--base', base, '--vars', varsFile, '--local-certificate', '--on-limit', 'record', ...options.harness];
    const plans = [];
    if (options.passes.includes('guest')) plans.push(['guest', options.modes, false]);
    if (options.passes.includes('signed-in')) for (const mode of options.modes) plans.push(['signed-in', [mode], true]);
    for (const [scope, modes, session] of plans) {
      await boot();
      const out = path.join(options.out, scope + (session ? '-' + modes[0] : ''));
      status = Math.max(status, await runHarness([...common, '--scope', scope, '--modes', modes.join(','), ...(session ? ['--session', sessionFile] : []), '--out', out]));
    }
  } finally {
    if (proxy) await proxy.shutdown();
    await halt();
    fs.rmSync(secrets, { recursive: true, force: true });
  }
  process.exitCode = status;
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
