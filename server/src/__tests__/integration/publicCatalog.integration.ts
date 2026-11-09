import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { parseLead, leadCurrent } from '../../lib/sourceLeadRules';
import { countyIllustration, COUNTY_ILLUSTRATION_LABEL, COUNTY_ILLUSTRATION_SOURCE, UNKNOWN_SOURCE_DISTRICT } from '../../lib/sourceCountyIllustration';
import { discoveryPage, discoveryQuery, scanDiscovery, type DiscoveryProduct } from '../../lib/discovery';
import { buildCatalog, catalogDiscoveryPage, catalogProduct, catalogProducts, catalogReady, catalogSourceCount, reconcileCatalog } from '../../lib/publicCatalog';
import { createDiscoveryRoutes } from '../../routes/discoveryRoutes';
import { createSourceLeadRoutes } from '../../routes/sourceLeadRoutes';
import { createLoopbackRequest } from './loopbackHttp';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Isolated DB required');

const app = express(); app.use(express.json()); app.use('/discovery', createDiscoveryRoutes()); app.use('/source-leads', createSourceLeadRoutes());
const http = createLoopbackRequest(app);
const run = randomUUID().slice(0, 8), flags = { source: process.env.SOURCE_LEADS_PUBLIC_ENABLED, off: process.env.PUBLIC_CATALOG_DISABLED };
const leadIds: string[] = [], listingIds: string[] = [];
let userId: number;

const names: Array<[string, number]> = [['BenQ GW2270 二手電腦螢幕', 900], ['Apple MacBook Air 筆電', 18500], ['Sony 無線耳機', 4200], ['兒童繪本套書', 600], ['IKEA 書桌', 0], ['登山背包', 1300]];
const counties = ['臺北市', '新北市', '臺南市'];
function lead(index: number, now: Date, extra: { title?: string; contact?: boolean } = {}) {
  const [name, price] = names[index % names.length], county = counties[index % counties.length], point = countyIllustration(county)!;
  const id = randomUUID(), url = 'https://www.facebook.com/groups/9000000002/posts/' + id.replace(/-/g, '');
  const posted = new Date(now.getTime() - (1 + index % 30) * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const located = !extra.contact;
  const data = parseLead({
    archiveItemId: 'PC' + run + '-' + index, libraryFileId: null, archiveVersion: null, archiveSha256: null, title: (extra.title ?? name) + ' ' + run + ' ' + index,
    summary: '公開來源參考，庫存與交易待確認。', canonicalUrl: url, county: located ? county : null, district: located ? UNKNOWN_SOURCE_DISTRICT : null,
    publicPlaceName: located ? county + '概略示意位置' : null, publicAddress: located ? county + '（' + COUNTY_ILLUSTRATION_LABEL + '）' : null,
    latitude: located ? point.latitude : null, longitude: located ? point.longitude : null, postedEarliestAt: posted, postedLatestAt: posted, checkedAt: new Date(now.getTime() - 60_000).toISOString(),
    evidence: {
      sourceUrl: url, sourcePublic: true, publicSourceRef: 'source:catalog-test/' + index, dateRef: 'source:catalog-test-date/' + index,
      ...(located ? { locationRef: 'source:catalog-test-location/' + index, coordinateRef: 'source:catalog-test-coordinate/' + index, locationSourceUrl: url, coordinateSourceUrl: COUNTY_ILLUSTRATION_SOURCE } : {}),
      publicPlace: false, locationType: located ? 'COUNTY_ILLUSTRATION' : 'SELLER_CONTACT_REQUIRED', sourceMeetingPointConfirmed: false, independentlyReviewed: true, selfWrittenSummary: true,
      noCopiedTextOrImages: true, noPrivateData: true, reviewRef: 'review:catalog-test', sourceCheckRef: 'source:catalog-test-check/' + index,
      ...(located ? { countyIllustration: { county, sourceUrl: url, sourceCountyRef: 'source:catalog-test-county/' + index, representativeKey: point.key, approvalRef: 'review:catalog-test-county', districtStatus: 'UNKNOWN' } } : {}),
      publicFacts: { priceText: index % 7 === 3 ? '未標價' : 'NT$ ' + (price + index), priceUnitStatus: 'unknown', currencyStatus: 'TWD', sourceAccessNotice: '合成公開來源。', originalDateLabel: '合成刊登時間 ' + posted, locationRelation: located ? '概略位置，非取貨點。' : '未提供地區，需向賣家確認。', coordinateQualityNotes: [] },
    },
  }, now, true);
  return { id, ...data, recordOrigin: 'DB_MASTER', status: 'PUBLISHED' };
}
async function listing(index: number, now: Date, data: Record<string, unknown> = {}) {
  const row = await prisma.listing.create({ data: { ownerUserId: userId, clientListingId: randomUUID(), requestHash: 'catalog-' + run, title: names[index % names.length][0] + '（站內）' + run + ' ' + index,
    description: '合成站內商品', category: index % 2 ? 'electronics' : 'home', brand: index % 3 === 0 ? 'BenQ' : null, condition: index % 2 ? 'USED' : 'NEW', price: 300 + index * 111, currency: 'TWD', status: 'ACTIVE',
    publishedAt: new Date(now.getTime() - index * 60_000), expiresAt: new Date(now.getTime() + 86_400_000), mapVisibleUntil: index % 2 ? new Date(now.getTime() + 3_600_000) : null,
    location: { create: { county: '臺北市', district: '中山區', publicLatitude: 25.05 + index * 0.01, publicLongitude: 121.52 + index * 0.01 } }, ...data } });
  listingIds.push(row.id);
  return row.id;
}
// Everything a client can see, minus the two values that are allowed to differ
// between the full scan and the read model: the snapshot token and the clock.
const comparable = (page: any) => { const { snapshot, nextCursor, generatedAt, ...rest } = page; return JSON.parse(JSON.stringify({ ...rest, more: nextCursor !== null })); };
const fullScan = async (raw: Record<string, string>, now: Date) => { const query = discoveryQuery(raw); return discoveryPage(await scanDiscovery(now, query.presentation === 'map'), query); };
const readModel = (raw: Record<string, string>, now: Date) => catalogDiscoveryPage(discoveryQuery(raw), now);
async function everyKey(read: (raw: Record<string, string>) => Promise<any>, raw: Record<string, string>) {
  const keys: string[] = [];
  for (let page = await read(raw); ; page = await read({ ...raw, cursor: page.nextCursor })) { keys.push(...page.items.map((p: DiscoveryProduct) => p.key)); if (!page.nextCursor) return keys; }
}

beforeAll(async () => {
  process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1'; delete process.env.PUBLIC_CATALOG_DISABLED;
  const now = new Date();
  userId = (await prisma.user.create({ data: { phoneNumber: 'catalog-' + run, password: 'synthetic' } })).id;
  const rows = Array.from({ length: 137 }, (_, index) => lead(index, now, { contact: index % 5 === 4 }));
  leadIds.push(...rows.map(row => row.id));
  await prisma.externalSourceLead.createMany({ data: rows });
  for (let index = 0; index < 9; index++) await listing(index, now);
  await prisma.listingMedia.create({ data: { ownerUserId: userId, listingId: listingIds[0], imageUrl: 'https://example.invalid/a.webp', thumbnailUrl: 'https://example.invalid/a-thumb.webp', contentHash: 'a'.repeat(64), position: 0 } });
  await buildCatalog();
}, 120_000);
afterAll(async () => {
  for (const [name, value] of [['SOURCE_LEADS_PUBLIC_ENABLED', flags.source], ['PUBLIC_CATALOG_DISABLED', flags.off]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  await prisma.externalSourceLead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.listing.deleteMany({ where: { ownerUserId: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$executeRaw`TRUNCATE "PublicCatalogDirty"`;
  await prisma.$executeRaw`UPDATE "PublicCatalogState" SET "readyAt" = NULL`;
  await prisma.$disconnect();
});

it('is ready after a complete build and lists the same products in the same order as the full scan', async () => {
  expect(await catalogReady()).toBe(true);
  const now = new Date();
  for (const map of [false, true]) expect(JSON.parse(JSON.stringify(await catalogProducts(now, map)))).toEqual(JSON.parse(JSON.stringify(await scanDiscovery(now, map))));
});

const queries: Array<Record<string, string>> = [
  {}, { limit: '60' }, { limit: '7' }, { q: 'benq' }, { q: run + ' 螢幕' }, { q: '不存在的字' }, { main: 'electronics' }, { main: 'electronics', sub: 'monitors' }, { main: 'books' },
  { source: 'listing' }, { source: 'source' }, { source: 'external' }, { condition: 'USED' }, { condition: 'NEW' }, { condition: 'UNKNOWN' }, { county: '臺北市' }, { county: '臺南市', main: 'electronics' },
  { min: '1000' }, { max: '900' }, { min: '500', max: '5000', sort: 'price-asc' }, { sort: 'price-asc', limit: '60' }, { sort: 'price-desc', limit: '60' }, { sort: 'recommended' },
  { presentation: 'map' }, { presentation: 'map', limit: '60' }, { presentation: 'map', bbox: '121,24.5,122,25.5' }, { presentation: 'map', bbox: '120,22,120.5,23.5', sort: 'price-asc' },
  { presentation: 'map', bbox: '-20,-10,0,10', source: 'listing' }, { presentation: 'map', county: '新北市', min: '100' },
];
it.each(queries)('returns what the full scan returns for %j', async raw => {
  const now = new Date();
  expect(comparable(await readModel(raw, now))).toEqual(comparable(await fullScan(raw, now)));
});
it.each([{ limit: '50' }, { limit: '13', sort: 'price-asc' }, { limit: '20', presentation: 'map' }, { limit: '9', q: run, sort: 'price-desc' }] as Array<Record<string, string>>)('pages through every result exactly once, in the full scan order, for %j', async raw => {
  const now = new Date(), expected = await everyKey(query => fullScan(query, now), raw), actual = await everyKey(query => readModel(query, now), raw);
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
});

it('shows a write to the very next read and rejects the cursor of the previous result', async () => {
  const first = await http.get('/discovery?limit=5&q=' + run);
  expect(first.status).toBe(200); expect(first.body.nextCursor).toBeTruthy();
  const total = first.body.total, now = new Date();
  const added = lead(900, now, { title: '剛剛新增的合成來源' });
  leadIds.push(added.id);
  await prisma.externalSourceLead.create({ data: added });
  const after = await http.get('/discovery?limit=5&q=' + run);
  expect(after.body.total).toBe(total + 1);
  expect((await http.get('/discovery?limit=5&q=' + run + '&cursor=' + first.body.nextCursor)).body.errorCode).toBe('DISCOVERY_RESULTS_CHANGED');
  expect((await http.get('/discovery/products/source/' + added.id)).status).toBe(200);
  await prisma.externalSourceLead.update({ where: { id: added.id }, data: { status: 'WITHDRAWN' } });
  expect((await http.get('/discovery?limit=5&q=' + run)).body.total).toBe(total);
  expect((await http.get('/discovery/products/source/' + added.id)).status).toBe(404);
  expect(await catalogProduct('source:' + added.id)).toBeNull();
});
it('follows listing, photo and location changes made through any write', async () => {
  const id = listingIds[1], find = async () => (await catalogProducts(new Date(), true)).find(p => p.id === id);
  expect((await find())?.thumbnailUrl).toBeNull();
  const media = await prisma.listingMedia.create({ data: { ownerUserId: userId, listingId: id, imageUrl: 'https://example.invalid/b.webp', thumbnailUrl: 'https://example.invalid/b-thumb.webp', contentHash: 'b'.repeat(64), position: 0 } });
  expect((await find())?.thumbnailUrl).toBe('https://example.invalid/b-thumb.webp');
  await prisma.listingLocation.update({ where: { listingId: id }, data: { county: '高雄市', district: '苓雅區' } });
  expect((await find())?.county).toBe('高雄市');
  // A statement that names no ids, as a script or console session might run.
  await prisma.$executeRaw`UPDATE "Listing" SET "title" = "title" || ' 改', "price" = 123 WHERE "id" = ${id}`;
  expect(await find()).toMatchObject({ price: 123, title: expect.stringMatching(/ 改$/) });
  await prisma.listingMedia.delete({ where: { id: media.id } });
  expect((await find())?.thumbnailUrl).toBeNull();
  await prisma.listing.update({ where: { id }, data: { status: 'SOLD' } });
  expect(await find()).toBeUndefined();
  const now = new Date();
  expect(comparable(await readModel({ source: 'listing' }, now))).toEqual(comparable(await fullScan({ source: 'listing' }, now)));
});
it('applies listing and map deadlines at the moment of the read', async () => {
  const now = new Date(), soon = await listing(40, now, { expiresAt: new Date(now.getTime() + 60_000), mapVisibleUntil: new Date(now.getTime() + 30_000) });
  for (const moment of [now, new Date(now.getTime() + 45_000), new Date(now.getTime() + 61_000)]) {
    for (const raw of [{ source: 'listing' }, { source: 'listing', presentation: 'map' }] as Array<Record<string, string>>) expect(comparable(await readModel(raw, moment))).toEqual(comparable(await fullScan(raw, moment)));
  }
  expect(await catalogProduct('listing:' + soon, new Date(now.getTime() + 61_000))).toBeNull();
});
it('counts public source references like the full scan and honours the feature switch at read time', async () => {
  const now = new Date(), expected = (await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED' } })).filter(row => leadCurrent(row, now)).length;
  expect(await catalogSourceCount(now)).toBe(expected);
  expect((await http.get('/source-leads/summary')).body).toEqual({ count: expected, enabled: true });
  process.env.SOURCE_LEADS_PUBLIC_ENABLED = '0';
  expect((await http.get('/discovery')).body.counts.source).toBe(0);
  expect((await http.get('/source-leads/summary')).body).toEqual({ count: 0, enabled: false });
  process.env.SOURCE_LEADS_PUBLIC_ENABLED = '1';
});
it('answers the ordinary feed, the count and a single product without reading any source table', async () => {
  const touched: string[] = [];
  prisma.$use(async (params, next) => { if (params.model) touched.push(params.model); return next(params); });
  await http.get('/discovery'); await http.get('/discovery?main=electronics&sort=price-asc&limit=60'); await http.get('/source-leads/summary'); await http.get('/discovery/products/source/' + leadIds[0]);
  expect(touched.filter(model => ['Listing', 'ExternalSourceLead', 'ExternalListingCandidate', 'ListingMedia'].includes(model))).toEqual([]);
  // The recorder does see model reads: the next line is one.
  await prisma.user.findUnique({ where: { id: userId } });
  expect(touched).toContain('User');
});
it('uses the full scan while more changes are pending than a request should rebuild, and returns once they are done', async () => {
  // Thousands of rows changed at once: the next read must still be exact, without doing all that work itself.
  await prisma.$executeRaw`INSERT INTO "PublicCatalogDirty" ("kind", "refId") SELECT 'source', 'pending-' || n FROM generate_series(1, 2001) AS n`;
  const now = new Date(), added = lead(950, now, { title: '大量異動期間新增的合成來源' });
  leadIds.push(added.id);
  await prisma.externalSourceLead.create({ data: added });
  expect(await catalogReady()).toBe(false);
  const during = await http.get('/discovery?q=' + encodeURIComponent('大量異動期間新增 ' + run));
  expect(during.status).toBe(200);
  expect(during.body.items.map((p: DiscoveryProduct) => p.id)).toEqual([added.id]);
  expect((await http.get('/source-leads/summary')).body.count).toBe((await prisma.externalSourceLead.findMany({ where: { status: 'PUBLISHED' } })).filter(row => leadCurrent(row, new Date())).length);
  await buildCatalog();
  expect(await catalogReady()).toBe(true);
  const after = new Date();
  expect(comparable(await readModel({ q: run, limit: '60' }, after))).toEqual(comparable(await fullScan({ q: run, limit: '60' }, after)));
});
it('repairs an entry that no longer matches its source row, and the full scan stays available as the switch-off path', async () => {
  await prisma.$executeRaw`UPDATE "PublicCatalogEntry" SET "price" = 1, "contentHash" = 'tampered' WHERE "key" = ${'source:' + leadIds[0]}`;
  await reconcileCatalog();
  await buildCatalog();
  const now = new Date();
  expect(comparable(await readModel({ q: run, limit: '60' }, now))).toEqual(comparable(await fullScan({ q: run, limit: '60' }, now)));
  process.env.PUBLIC_CATALOG_DISABLED = '1';
  expect(await catalogReady()).toBe(false);
  const scanned = await http.get('/discovery?limit=3&q=' + run);
  delete process.env.PUBLIC_CATALOG_DISABLED;
  const projected = await http.get('/discovery?limit=3&q=' + run);
  expect(scanned.status).toBe(200);
  expect(comparable(projected.body)).toEqual(comparable(scanned.body));
});
