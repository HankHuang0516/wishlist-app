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
const { getMe } = require('../dist/controllers/userController');
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
let drop = null, rejectRemoval = false, dropped = { message: 0, meetup: 0, photo: 0, wish: 0, photoRemoval: 0 }, attempts = { message: 0, meetup: 0, photo: 0, wish: 0, photoRemoval: 0, messageReceipt: 0 }, users, listing, photoId, server;
app.post('/__test/drop-next-ack', (req, res) => {
  if (!['message', 'meetup', 'photo', 'wish', 'photoRemoval'].includes(req.body.kind)) return res.status(400).json({ error: 'Choose an isolated workflow' });
  drop = req.body.kind; res.json({ armed: drop });
});
// Non-destructive UI failure fixture. Return before ANY handler/DB mutation.
// The later commit/recovery check is performed separately with the real API.
app.post('/__test/reject-next-photo-removal', (_req, res) => { rejectRemoval = true; res.json({ syntheticOnly: true, armed: true }); });
app.use((req, res, next) => {
  const kind = req.method === 'POST' && /^\/api\/chat\/conversations\/[^/]+\/messages$/.test(req.path) ? 'message' :
    req.method === 'POST' && /^\/api\/chat\/conversations\/[^/]+\/meetup$/.test(req.path) ? 'meetup' :
    req.method === 'POST' && req.path === '/api/listing-media' ? 'photo' :
    req.method === 'POST' && /^\/api\/native-wishes\/lists\/[^/]+\/items$/.test(req.path) ? 'wish' :
    req.method === 'POST' && /^\/api\/native-wishes\/photo-removals\/[^/]+$/.test(req.path) ? 'photoRemoval' : null;
  if (req.method === 'GET' && /\/messages\/by-client-id\//.test(req.path)) attempts.messageReceipt++;
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
app.get('/api/listings/:id', getListing);
// A clearly synthetic placeholder only; this does not test Flickr transport.
app.get('/api/listing-media/:id/:variant', (req, res, next) => {
  if (req.params.id !== photoId || !['image', 'thumbnail'].includes(req.params.variant)) return next();
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
    photoRemovalReceipts: await prisma.wishPhotoRemovalReceipt.findMany({ where: { userId: { in: users.map(user => user.id) } }, select: { clientUploadId: true, mediaId: true, removedAt: true } }),
    appointments: await prisma.meetupAppointment.findMany({ where: { conversationId: { in: rooms.map(room => room.id) } }, select: { version: true, status: true, buyerConfirmedAt: true, sellerConfirmedAt: true, buyerCompletedAt: true, sellerCompletedAt: true } }), dropped, attempts });
});
app.use((_req, res) => res.status(404).json({ error: 'This isolated smoke server does not expose that workflow' }));
async function main() {
  const run = randomUUID(), password = await bcrypt.hash('WebParityOnly!2026', 10);
  users = await Promise.all(['buyer', 'seller'].map(role => prisma.user.create({ data: { phoneNumber: `web-parity-${run}-${role}`, email: `${role}.${run}@example.invalid`, password, isEmailVerified: true, name: role === 'buyer' ? '合成測試買家' : '合成測試賣家' }, select: { id: true, email: true, name: true } })));
  listing = await prisma.listing.create({ data: { ownerUserId: users[1].id, clientListingId: randomUUID(), requestHash: 'synthetic-web-parity-only', title: '合成測試漫畫（不可購買）', description: '僅供隔離驗收，不是真實刊登；圖片為合成測試替代圖。', category: 'books', price: 59, condition: 'USED', deliveryMethods: ['MEETUP'], status: 'ACTIVE', publishedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000), location: { create: { county: '臺北市', district: '中正區', publicLatitude: 25.05, publicLongitude: 121.51, precisionMeters: 2200 } } } });
  photoId = randomUUID();
  await prisma.listingMedia.create({ data: { id: photoId, ownerUserId: users[1].id, listingId: listing.id, imageUrl: `http://127.0.0.1:5183/api/listing-media/${photoId}/image`, thumbnailUrl: `http://127.0.0.1:5183/api/listing-media/${photoId}/thumbnail`, contentHash: 'synthetic-placeholder-not-flickr', capturePurpose: 'MANUAL_PHOTO' } });
  await new Promise((resolve, reject) => { server = app.listen(5183, '127.0.0.1', resolve); server.once('error', reject); });
  console.log(JSON.stringify({ syntheticOnly: true, origin: 'http://127.0.0.1:5183', storageRoot: process.env.LISTING_MEDIA_STORAGE_ROOT, users, listingId: listing.id }));
}
async function stop() { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
main().catch(async () => { console.error('Isolated smoke startup failed; details withheld'); await prisma.$disconnect(); process.exitCode = 1; });
