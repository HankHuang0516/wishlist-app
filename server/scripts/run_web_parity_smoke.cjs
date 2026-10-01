/** Browser smoke against REAL compiled handlers and isolated PostgreSQL.
 * No production credentials, accounts, external worker, email, Flickr or AI.
 * Run only after build/migrate, with equal explicit local test DB URLs.
 * This listener is loopback-only. Restart creates a separate synthetic run.
 */
'use strict';
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error('Explicit equal isolated database URLs required');
const { randomBytes, randomUUID } = require('node:crypto');
process.env.JWT_SECRET = randomBytes(48).toString('hex');
// These settings precede all app imports: no inherited production storage or
// worker credentials may turn this isolated test into an external operation.
process.env.NODE_ENV = 'test';
process.env.API_URL = 'http://127.0.0.1:5183/api';
process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'local';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.LISTING_MEDIA_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-web-photo-smoke-'));
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const prisma = require('../dist/lib/prisma').default;
const { login } = require('../dist/controllers/authController');
const { getMe, updateMe, getAiUsage } = require('../dist/controllers/userController');
const { getProfileOperation, submitProfileOperation, abandonProfileOperation } = require('../dist/controllers/profileUpdateController');
const { getUpcomingBirthdays } = require('../dist/controllers/socialController');
const { marketingAvailability } = require('../dist/controllers/marketingController');
const { searchListings, createListing, myListings, getListingCreation, abandonListingCreation } = require('../dist/controllers/listingController');
const { getMatchWishes, matchWishListings } = require('../dist/controllers/wishlistMatchController');
const { authenticateToken } = require('../dist/middleware/auth');
const { getListing } = require('../dist/controllers/listingController');
const chatRoutes = require('../dist/routes/chatRoutes').default;
const nativeWishRoutes = require('../dist/routes/nativeWishRoutes').default;
const listingMediaRoutes = require('../dist/routes/listingMediaRoutes').default;
const { getWishlists } = require('../dist/controllers/wishlistController');
const app = express();
app.use(cors({ origin: 'http://127.0.0.1:5182' }));
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
let drop = null, rejectRemoval = false, rejectPhotoReceipt = false, dropped = { listing: 0, profile: 0, message: 0, meetup: 0, photo: 0, wish: 0, photoRemoval: 0, draft: 0, marketingApprove: 0, marketingQueue: 0 }, attempts = { listing: 0, listingReceipt: 0, listingAbandon: 0, profile: 0, profileReceipt: 0, message: 0, meetup: 0, photo: 0, photoReceipt: 0, photoAbandon: 0, wish: 0, photoRemoval: 0, messageReceipt: 0, draft: 0, draftReceipt: 0, draftAbandon: 0, marketingApprove: 0, marketingApprovalReceipt: 0, marketingApprovalAbandon: 0, marketingQueue: 0, marketingQueueReceipt: 0 }, users, listing, photoId, server;
app.post('/__test/drop-next-ack', (req, res) => {
  if (!['listing', 'profile', 'message', 'meetup', 'photo', 'wish', 'photoRemoval', 'draft', 'marketingApprove', 'marketingQueue'].includes(req.body.kind)) return res.status(400).json({ error: 'Choose an isolated workflow' });
  drop = req.body.kind; res.json({ armed: drop });
});
// Non-destructive UI failure fixture. Return before ANY handler/DB mutation.
// The later commit/recovery check is performed separately with the real API.
app.post('/__test/reject-next-photo-removal', (_req, res) => { rejectRemoval = true; res.json({ syntheticOnly: true, armed: true }); });
app.post('/__test/reject-next-photo-receipt', (_req, res) => { rejectPhotoReceipt = true; res.json({ syntheticOnly: true, armed: true }); });
app.use((req, res, next) => {
  const kind = req.method === 'POST' && req.path === '/api/listings' ? 'listing' :
    req.method === 'POST' && /^\/api\/marketing\/requests\/[^/]+$/.test(req.path) ? 'marketingQueue' :
    req.method === 'POST' && /^\/api\/listing-media\/[^/]+\/seller-draft-operations\/[^/]+$/.test(req.path) ? 'draft' :
    req.method === 'POST' && (/^\/api\/marketing\/jobs\/[^/]+\/approve$/.test(req.path)||/^\/api\/marketing\/approvals\/[^/]+$/.test(req.path)) ? 'marketingApprove' :
    req.method === 'POST' && /^\/api\/chat\/conversations\/[^/]+\/messages$/.test(req.path) ? 'message' :
    req.method === 'POST' && /^\/api\/chat\/conversations\/[^/]+\/meetup$/.test(req.path) ? 'meetup' :
    req.method === 'POST' && req.path === '/api/listing-media' ? 'photo' :
    req.method === 'POST' && /^\/api\/native-wishes\/lists\/[^/]+\/items$/.test(req.path) ? 'wish' :
    req.method === 'POST' && /^\/api\/native-wishes\/photo-removals\/[^/]+$/.test(req.path) ? 'photoRemoval' :
    req.method === 'POST' && /^\/api\/users\/me\/profile-operations\/[^/]+$/.test(req.path) ? 'profile' : null;
  if (req.method === 'GET' && /\/profile-operations\//.test(req.path)) attempts.profileReceipt++;
  if (req.method === 'GET' && /\/marketing\/requests\/[^/]+$/.test(req.path)) attempts.marketingQueueReceipt++;
  if (req.method === 'GET' && /\/marketing\/approvals\/[^/]+$/.test(req.path)) attempts.marketingApprovalReceipt++;
  if (req.method === 'POST' && /\/marketing\/approvals\/[^/]+\/abandon$/.test(req.path)) attempts.marketingApprovalAbandon++;
  if (req.method === 'GET' && /\/seller-draft-operations\//.test(req.path)) attempts.draftReceipt++;
  if (req.method === 'POST' && /\/seller-draft-operations\/[^/]+\/abandon$/.test(req.path)) attempts.draftAbandon++;
  if (req.method === 'GET' && /\/messages\/by-client-id\//.test(req.path)) attempts.messageReceipt++;
  if (req.method === 'GET' && /\/listings\/creation-receipts\//.test(req.path)) attempts.listingReceipt++;
  if (req.method === 'POST' && /\/listings\/creation-receipts\/[^/]+\/abandon$/.test(req.path)) attempts.listingAbandon++;
  if (req.method === 'POST' && /\/listing-media\/upload-receipts\/[^/]+\/abandon$/.test(req.path)) attempts.photoAbandon++;
  if (req.method === 'GET' && /\/listing-media\/upload-receipts\//.test(req.path)) {
    attempts.photoReceipt++;
    if (rejectPhotoReceipt) { rejectPhotoReceipt = false; return res.status(503).json({ error: 'Synthetic read failure before receipt lookup', errorCode: 'TEST_RECEIPT_UNAVAILABLE' }); }
  }
  if (kind) {
    attempts[kind]++;
    if (kind === 'photoRemoval' && rejectRemoval) { rejectRemoval = false; return res.status(503).json({ error: 'Synthetic failure BEFORE mutation; no photo removed', errorCode: 'TEST_BEFORE_MUTATION' }); }
    const json = res.json.bind(res);
    // Returning a deterministic upstream-style error AFTER commit also avoids
    // Chrome's transport retry of a connection that closed before any headers.
    res.json = body => { if (kind === drop && res.statusCode >= 200 && res.statusCode < 300) { drop = null; dropped[kind]++; res.status(502); return json({ error: 'Synthetic committed ACK loss; original operation must be recovered', errorCode: 'TEST_ACK_LOSS' }); } return json(body); };
  }
  next();
});
app.post('/api/auth/login', login);
app.get('/api/users/me', authenticateToken, getMe);
app.put('/api/users/me', authenticateToken, updateMe);
app.get('/api/users/me/profile-operations/:clientActionId', authenticateToken, getProfileOperation);
app.post('/api/users/me/profile-operations/:clientActionId', authenticateToken, submitProfileOperation);
app.post('/api/users/me/profile-operations/:clientActionId/abandon', authenticateToken, abandonProfileOperation);
app.get('/api/users/me/ai-usage', authenticateToken, getAiUsage);
app.get('/api/users/upcoming-birthdays', authenticateToken, getUpcomingBirthdays);
app.get('/api/marketing/availability', authenticateToken, marketingAvailability);
app.use('/api/marketing', require('../dist/routes/marketingRoutes').default);
app.get('/api/listings', searchListings);
app.post('/api/listings', authenticateToken, createListing);
app.get('/api/listings/mine', authenticateToken, myListings);
app.get('/api/listings/match-wishes', authenticateToken, getMatchWishes);
app.get('/api/listings/matches', authenticateToken, matchWishListings);
app.get('/api/listings/creation-receipts/:clientListingId', authenticateToken, getListingCreation);
app.post('/api/listings/creation-receipts/:clientListingId/abandon', authenticateToken, abandonListingCreation);
app.get('/api/listings/:id', getListing);
// Legacy no-photo fixtures use a labelled placeholder. Marketing fixtures have
// real local source bytes and must pass through the real media handler below.
// Neither fixture mode tests Flickr transport.
app.get('/api/listing-media/:id/:variant', (req, res, next) => {
  if (process.env.WEB_PARITY_MARKETING_FIXTURES === '1' || req.params.id !== photoId || !['image', 'thumbnail'].includes(req.params.variant)) return next();
  res.sendFile(path.resolve(__dirname, '../../client/public/logo.png'));
});
app.use('/api/chat', chatRoutes);
app.use('/api/native-wishes', nativeWishRoutes);
app.use('/api/listing-media', listingMediaRoutes);
app.get('/api/wishlists', authenticateToken, getWishlists);
// Explicit synthetic completion fixture, not a model or accuracy test. It can
// update only this run's owners and never contacts the real recognition worker.
app.post('/__test/complete-wish', async (req, res) => {
  if (!Number.isSafeInteger(req.body.id) || req.body.id < 1) return res.sendStatus(400);
  const changed = await prisma.item.updateMany({ where: { id: req.body.id, wishlist: { userId: { in: users.map(user => user.id) } }, aiStatus: 'PENDING' },
    data: { name: '合成照片流程測試（非AI辨識結果）', notes: '僅驗證完成狀態回讀，不代表MiniMax已辨識此照片。', aiStatus: 'COMPLETED', price: '59', currency: 'TWD' } });
  return res.json({ syntheticOnly: true, changed: changed.count });
});
app.get('/__test/state', async (_req, res) => {
  const rooms = await prisma.conversation.findMany({ where: { listingId: listing.id }, select: { id: true, lastMessageSequence: true } });
  res.json({ syntheticOnly: true, users: users.map(({ id, name, email }) => ({ id, name, email })), listingId: listing.id, rooms,
    messageCount: await prisma.message.count({ where: { conversationId: { in: rooms.map(room => room.id) } } }),
    wishes: await prisma.item.findMany({ where: { wishlist: { userId: { in: users.map(user => user.id) } } }, select: { id: true, wishlistId: true, aiStatus: true, imageUrl: true } }),
    photos: await prisma.listingMedia.findMany({ where: { ownerUserId: { in: users.map(user => user.id) }, clientUploadId: { not: null } }, select: { id: true, clientUploadId: true, wishItemId: true, byteSize: true, width: true, height: true } }),
    createdListings: await prisma.listing.findMany({ where: { ownerUserId: users[0].id }, select: { id: true, title: true, status: true, clientListingId: true, expiryMode: true, expiresAt: true, media: { select: { id: true } } } }),
    listingCreationReceipts: await prisma.listingCreateReceipt.findMany({ where: { userId: users[0].id }, select: { clientListingId: true, state: true, listingId: true } }),
    photoRemovalReceipts: await prisma.wishPhotoRemovalReceipt.findMany({ where: { userId: { in: users.map(user => user.id) } }, select: { clientUploadId: true, mediaId: true, removedAt: true } }),
    photoUploadReceipts: await prisma.photoUploadReceipt.findMany({ where: { userId: { in: users.map(user => user.id) } }, select: { clientUploadId: true, mediaId: true, state: true } }),
    sellerDraftReceipts: await prisma.sellerDraftReceipt.findMany({ where: { userId: { in: users.map(user => user.id) } }, select: { clientActionId: true, mediaId: true, state: true, appliedVersion: true } }),
    sellerDrafts: await prisma.listingMedia.findMany({ where: { ownerUserId: { in: users.map(user => user.id) }, capturePurpose: 'BATCH_ITEM' }, select: { id: true, sellerDraftVersion: true, sellerDraft: true } }),
    marketingRequestReceipts: await prisma.marketingRequestReceipt.findMany({where:{userId:{in:users.map(user=>user.id)}},select:{clientRequestId:true,state:true,jobId:true}}),
    marketingApprovalReceipts: await prisma.marketingApprovalReceipt.findMany({where:{userId:{in:users.map(user=>user.id)}},select:{clientActionId:true,jobId:true,state:true,reason:true,appliedVersion:true,selectedMediaIds:true}}),
    marketingJobs: await prisma.marketingJob.findMany({ where: { ownerUserId: { in: users.map(user => user.id) } }, select: { id: true, status: true, parentJobId: true, revisionSlots: true, copy: true, generatedMedia: { select: { id: true, marketingSlot: true, marketingSelected: true, position: true } } } }),
    appointments: await prisma.meetupAppointment.findMany({ where: { conversationId: { in: rooms.map(room => room.id) } }, select: { version: true, status: true, buyerConfirmedAt: true, sellerConfirmedAt: true, buyerCompletedAt: true, sellerCompletedAt: true } }), dropped, attempts });
});
app.post('/__test/marketing/deliver', async (req, res) => {
  // An explicit synthetic delivery fixture, never a model or external worker.
  if (process.env.WEB_PARITY_MARKETING_FIXTURES !== '1' || !users) return res.sendStatus(404);
  const job = await prisma.marketingJob.findFirst({ where: { id: req.body.jobId, ownerUserId: users[1].id, status: { in: ['PENDING', 'PROCESSING'] } } });
  if (!job || Object.keys(req.body).join(',') !== 'jobId') return res.sendStatus(409);
  const sharp = require('sharp'), { ListingMediaStorage } = require('../dist/lib/listingMediaStorage');
  const { createHash } = require('node:crypto'), storage = new ListingMediaStorage(); await storage.ready();
  const slots = job.parentJobId ? job.revisionSlots : [1, 2, 3, 4];
  const input = path.resolve(__dirname, '../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png');
  for (const slot of slots) {
    const id = randomUUID();
    const image = await sharp(input).resize({ width: (job.parentJobId ? 640 : 800) + slot * 32 }).webp({ quality: 80 }).toBuffer();
    const thumb = await sharp(image).resize({ width: 320, height: 320, fit: 'inside' }).webp({ quality: 75 }).toBuffer();
    await storage.write(id, image, thumb);
    await prisma.listingMedia.create({ data: { id, ownerUserId: users[1].id, marketingJobId: job.id, marketingSlot: slot, capturePurpose: 'AI_MARKETING', imageUrl: `http://127.0.0.1:5183/api/listing-media/${id}/image`, thumbnailUrl: `http://127.0.0.1:5183/api/listing-media/${id}/thumbnail`, contentHash: createHash('sha256').update(image).digest('hex') } });
  }
  await prisma.marketingJob.update({ where: { id: job.id }, data: { status: 'REVIEW', deliveredAt: new Date(), copy: '合成橘色二手檯燈，售價 NT$350。僅供隔離流程驗收，不是 AI 行銷成果或可購買商品。' } });
  return res.json({ syntheticOnly: true, jobId: job.id, deliveredSlots: slots, modelCalled: false });
});
app.use((_req, res) => res.status(404).json({ error: 'This isolated smoke server does not expose that workflow' }));
async function main() {
  const run = randomUUID(), password = await bcrypt.hash('WebParityOnly!2026', 10);
  users = await Promise.all(['buyer', 'seller'].map(role => prisma.user.create({ data: { phoneNumber: `web-parity-${run}-${role}`, email: `${role}.${run}@example.invalid`, password, isEmailVerified: true, name: role === 'buyer' ? '合成測試買家' : '合成測試賣家' }, select: { id: true, email: true, name: true } })));
  listing = await prisma.listing.create({ data: { ownerUserId: users[1].id, clientListingId: randomUUID(), requestHash: 'synthetic-web-parity-only', title: '合成測試漫畫（不可購買）', description: '僅供隔離驗收，不是真實刊登；圖片為合成測試替代圖。', category: 'books', price: 59, condition: 'USED', deliveryMethods: ['MEETUP'], status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), location: { create: { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 } } } });
  photoId = randomUUID();
  await prisma.listingMedia.create({ data: { id: photoId, ownerUserId: users[1].id, listingId: listing.id, imageUrl: `http://127.0.0.1:5183/api/listing-media/${photoId}/image`, thumbnailUrl: `http://127.0.0.1:5183/api/listing-media/${photoId}/thumbnail`, contentHash: 'synthetic-placeholder-not-flickr', capturePurpose: 'MANUAL_PHOTO' } });
  if (process.env.WEB_PARITY_MARKETING_FIXTURES === '1') {
    process.env.MARKETING_ASSISTANT_ENABLED = '1';
    process.env.MARKETING_ASSISTANT_PILOT_USER_ID = String(users[1].id);
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = randomBytes(48).toString('hex');
    const sharp = require('sharp'), { ListingMediaStorage } = require('../dist/lib/listingMediaStorage');
    const { createHash } = require('node:crypto'), storage = new ListingMediaStorage(); await storage.ready();
    const image = await sharp(path.resolve(__dirname, '../../mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png')).webp({ quality: 80 }).toBuffer();
    const thumb = await sharp(image).resize({ width: 320, height: 320, fit: 'inside' }).webp({ quality: 75 }).toBuffer();
    await storage.write(photoId, image, thumb);
    listing = await prisma.listing.update({ where: { id: listing.id }, data: { title: '合成橘色二手檯燈（不可購買）', description: '僅供隔離行銷流程驗收，非真實庫存。', category: 'home', price: 350 } });
    await prisma.listingMedia.update({ where: { id: photoId }, data: { contentHash: createHash('sha256').update(image).digest('hex') } });
  }
  // Opt-in style review uses only this run's newly created synthetic owners.
  // Real compiled search/matching/media/profile handlers; no AI completion.
  if (process.env.WEB_PARITY_STYLE_FIXTURES === '1') {
    const sharp = require('sharp');
    const { ListingMediaStorage } = require('../dist/lib/listingMediaStorage');
    const { createHash } = require('node:crypto');
    const store = new ListingMediaStorage(); await store.ready();
    const list = await prisma.wishlist.create({ data: { userId: users[0].id, title: '合成視覺驗收願望', isPublic: false } });
    for (const name of ['桌上型檯燈', '藍色杯', '橘色檯燈']) await prisma.item.create({ data: { wishlistId: list.id, name, aiStatus: 'SKIPPED' } });
    for (const [title, price, district, lng, lat, fixture] of [
      ['橘色桌上型檯燈 · 合成甲', 350, '板橋區', 121.46, 25.01, 'synthetic-used-orange-desk-lamp.png'],
      ['橘色桌上型檯燈 · 合成乙', 300, '中正區', 121.51, 25.05, 'synthetic-used-orange-desk-lamp.png'],
      ['橘色桌上型檯燈 · 合成丙', 400, '大安區', 121.55, 25.03, 'synthetic-used-orange-desk-lamp.png'],
      ['藍色杯 · 合成商品', 60, '大安區', 121.55, 25.03, 'synthetic-used-blue-mug.png'],
    ]) {
      const item = await prisma.listing.create({ data: { ownerUserId: users[1].id, clientListingId: randomUUID(), requestHash: 'synthetic-style-only', title, description: '合成測試商品，不可購買；非 AI 辨識結果。', category: 'other', price, condition: 'USED', deliveryMethods: ['MEETUP'], status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), location: { create: { county: district === '板橋區' ? '新北市' : '臺北市', district, publicLatitude: lat, publicLongitude: lng, precisionMeters: 2200 } } } });
      const id = randomUUID(), input = path.resolve(__dirname, '../../mobile/qa-fixtures', fixture);
      const image = await sharp(input).rotate().webp({ quality: 80 }).toBuffer();
      const thumb = await sharp(image).resize({ width: 320, height: 320, fit: 'inside' }).webp({ quality: 75 }).toBuffer();
      await store.write(id, image, thumb);
      await prisma.listingMedia.create({ data: { id, ownerUserId: users[1].id, listingId: item.id, imageUrl: `http://127.0.0.1:5183/api/listing-media/${id}/image`, thumbnailUrl: `http://127.0.0.1:5183/api/listing-media/${id}/thumbnail`, contentHash: createHash('sha256').update(image).digest('hex'), capturePurpose: 'MANUAL_PHOTO' } });
    }
  }
  await new Promise((resolve, reject) => { server = app.listen(5183, '127.0.0.1', resolve); server.once('error', reject); });
  console.log(JSON.stringify({ syntheticOnly: true, origin: 'http://127.0.0.1:5183', storageRoot: process.env.LISTING_MEDIA_STORAGE_ROOT, users, listingId: listing.id }));
}
async function stop() { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
main().catch(async () => { console.error('Isolated smoke startup failed; details withheld'); await prisma.$disconnect(); process.exitCode = 1; });
