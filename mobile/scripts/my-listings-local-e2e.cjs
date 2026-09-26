// Isolated seller-management HTTP acceptance. No production account, media or database.
const { randomUUID } = require('node:crypto');
const { startNativeQa } = require('./native-qa.cjs');
const { seedNativeMarketplace } = require('./native-qa-marketplace-fixture.cjs');
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');

const database = process.env.TEST_DATABASE_URL;
assertTestDatabase(database);
if (database !== process.env.DATABASE_URL) throw new Error('Isolated QA database bindings must agree');
let qa;

async function run() {
  qa = await startNativeQa(database, 180);
  const fixture = await seedNativeMarketplace(qa);
  async function login(actor) {
    const response = await fetch(qa.apiUrl + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: actor.phoneNumber, password: actor.password }), redirect: 'error' });
    if (response.status !== 200) throw new Error('Synthetic login failed');
    const data = await response.json();
    if (data.user?.id !== actor.id || typeof data.token !== 'string') throw new Error('Synthetic account mismatch');
    return data.token;
  }
  const seller = await login(qa.actors.seller), buyer = await login(qa.actors.buyer);
  async function request(token, route, method = 'GET', body, expected = 200) {
    const response = await fetch(qa.apiUrl + '/api' + route, { method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: 'error' });
    if (response.status !== expected) throw new Error(`Synthetic management response ${response.status}, expected ${expected}`);
    return response.json();
  }
  const own = await request(seller, '/listings/mine?limit=50');
  const foreign = await request(buyer, '/listings/mine?limit=50');
  if (own.items.length !== 1 || own.items[0].id !== fixture.listingId || own.items[0].ownerUserId !== qa.actors.seller.id ||
      foreign.items.length !== 0) throw new Error('Seller list isolation failed');
  let item = own.items[0];
  const oldVersion = item.version;
  item = await request(seller, `/listings/${item.id}`, 'PATCH', { expectedVersion: item.version,
    title: 'Native QA Switch OLED 已更新', description: '合成商品，管理頁已更新說明。', price: 7300 });
  if (item.version !== oldVersion + 1 || item.price !== '7300' || item.ownerUserId !== qa.actors.seller.id)
    throw new Error('Seller edit/version failed');
  await request(seller, `/listings/${item.id}`, 'PATCH', { expectedVersion: oldVersion, title: '過期覆寫' }, 409);
  await request(buyer, `/listings/${item.id}/status`, 'POST', { expectedVersion: item.version, action: 'sold' }, 404);
  for (const [action, status] of [['reserve', 'RESERVED'], ['release', 'ACTIVE']]) {
    const previous = item.version;
    item = await request(seller, `/listings/${item.id}/status`, 'POST', { expectedVersion: previous, action });
    if (item.status !== status || item.version !== previous + 1) throw new Error('Seller status transition failed');
  }
  const future = new Date(Date.now() + 45 * 86_400_000);
  const expiryDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(future);
  const previousExpiry = Date.parse(item.expiresAt), previousVersion = item.version;
  item = await request(seller, `/listings/${item.id}/extend`, 'POST', { expectedVersion: previousVersion, expiryDate });
  if (item.version !== previousVersion + 1 || Date.parse(item.expiresAt) <= previousExpiry || item.expiryMode !== 'CUSTOM_DATE')
    throw new Error('Seller expiry extension failed');
  item = await request(seller, `/listings/${item.id}/status`, 'POST', { expectedVersion: item.version, action: 'sold' });
  if (item.status !== 'SOLD') throw new Error('Seller sold state failed');
  const draft = await request(seller, '/listings', 'POST', { clientListingId: randomUUID(), title: 'Native QA 待整理草稿', publish: false }, 201);
  const removed = await request(seller, `/listings/${draft.id}/status`, 'POST', { expectedVersion: draft.version, action: 'remove' });
  if (removed.status !== 'REMOVED') throw new Error('Draft removal failed');
  console.log(JSON.stringify({ result: 'PASS', scope: 'isolated-my-listings-http', listed: own.items.length,
    foreignVisible: foreign.items.length, edit: true, staleVersionRejected: true,
    reservedAndReleased: true, extended: true, sold: true, draftRemoved: true }));
}

run().catch(() => { console.error('Isolated my-listings acceptance failed; private data withheld'); process.exitCode = 1; })
  .finally(async () => { if (qa) try { console.log(JSON.stringify({ cleanup: await qa.stop() })); }
    catch { console.error('Isolated my-listings cleanup failed'); process.exitCode = 1; } });
