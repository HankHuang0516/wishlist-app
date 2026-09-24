// Only launched by native-qa.cjs with a fresh, credential-free environment.
const { assertTestDatabase } = require('../../scripts/assert-test-database.cjs');
const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('node:http');
const allowedEnv = new Set(['PATH', 'NODE_ENV', 'TZ', 'TEST_DATABASE_URL', 'DATABASE_URL', 'JWT_SECRET', 'NATIVE_QA_LIFETIME_SECONDS', 'NATIVE_QA_LISTING_AI_PILOT', 'NATIVE_QA_EXTERNAL_LISTINGS_PILOT', 'NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE', '__CF_USER_TEXT_ENCODING']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let prisma, server, storage, root, timer, stopping;
let startup;
let startupStage = 'launch-guard';
let startupFailed = false;
const userIds = [], sourceIds = [], hashes = new Set(), roomIds = new Set();
const send = message => { if (process.connected) { try { process.send(message, () => undefined); } catch { /* Disconnect triggers owned cleanup. */ } } };

async function cleanFixtures() {
  if (!prisma) {
    if (root) await fs.rmdir(root);
    return { fixturesRemaining: 0, conversationsRemaining: 0, receiptsRemaining: 0, mediaTasksRemaining: 0, legacyTasksRemaining: 0, photoFoldersRemaining: 0 };
  }
  const ids = { in: userIds }, identityHashes = { in: [...hashes] };
  const rooms = await prisma.conversation.findMany({ where: { OR: [{ buyerUserId: ids }, { sellerUserId: ids }] }, select: { id: true } });
  rooms.forEach(room => roomIds.add(room.id));
  // This is our exclusively-created mkdtemp folder, not the ordinary media
  // root. Remove only validated UUID folders and the storage class's two files.
  if (root && storage) {
    for (const entry of await fs.readdir(root)) {
      if (!uuid.test(entry)) throw new Error('Unknown QA file retained');
      await storage.remove(entry);
    }
  }
  await prisma.$transaction(async tx => {
    if (sourceIds.length) {
      await tx.externalCandidateReviewEvent.deleteMany({ where: { candidate: { sourceId: { in: sourceIds } } } });
      await tx.externalListingCandidate.deleteMany({ where: { sourceId: { in: sourceIds } } });
      await tx.externalListingSource.deleteMany({ where: { id: { in: sourceIds } } });
    }
    await tx.conversation.deleteMany({ where: { id: { in: [...roomIds] } } });
    await tx.wishlist.deleteMany({ where: { userId: ids } });
    await tx.user.deleteMany({ where: { id: ids } });
    await tx.mediaErasureTask.deleteMany({ where: { identityHash: identityHashes } });
    await tx.legacyAssetErasureTask.deleteMany({ where: { identityHash: identityHashes } });
    await tx.accountErasureReceipt.deleteMany({ where: { identityHash: identityHashes } });
  });
  const summary = {
    fixturesRemaining: await prisma.user.count({ where: { id: ids } }),
    conversationsRemaining: await prisma.conversation.count({ where: { id: { in: [...roomIds] } } }),
    receiptsRemaining: await prisma.accountErasureReceipt.count({ where: { identityHash: identityHashes } }),
    mediaTasksRemaining: await prisma.mediaErasureTask.count({ where: { identityHash: identityHashes } }),
    legacyTasksRemaining: await prisma.legacyAssetErasureTask.count({ where: { identityHash: identityHashes } }),
    photoFoldersRemaining: root ? (await fs.readdir(root)).length : 0,
    ...(sourceIds.length ? {
      externalCandidatesRemaining: await prisma.externalListingCandidate.count({ where: { sourceId: { in: sourceIds } } }),
      externalSourcesRemaining: await prisma.externalListingSource.count({ where: { id: { in: sourceIds } } }),
    } : {}),
  };
  if (Object.values(summary).some(value => value !== 0)) throw new Error('QA cleanup incomplete');
  if (root) await fs.rmdir(root); // Non-recursive; refuses any unknown leftovers.
  return summary;
}

function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    // A stop during hashing/seeding must wait for the owned IDs to be captured.
    await startup.catch(() => undefined);
    clearTimeout(timer);
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      const summary = await cleanFixtures();
      await prisma?.$disconnect();
      send({ kind: 'stopped', summary });
      process.exitCode = startupFailed ? 1 : 0;
    } catch {
      await prisma?.$disconnect().catch(() => undefined);
      send({ kind: 'failed' });
      process.exitCode = 1;
    }
    if (process.connected) process.disconnect();
  })();
  return stopping;
}
process.on('message', message => { if (message?.kind === 'stop') void stop(); });
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });

async function main() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  if (!process.send || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL || process.env.NODE_ENV !== 'test' ||
      Object.keys(process.env).some(key => !allowedEnv.has(key)) || !/^[0-9a-f]{64}$/.test(process.env.JWT_SECRET || '')) throw new Error('Unsafe QA launch');
  const lifetime = Number(process.env.NATIVE_QA_LIFETIME_SECONDS);
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > 600) throw new Error('Unsafe QA lifetime');
  if (process.env.NATIVE_QA_LISTING_AI_PILOT !== undefined && process.env.NATIVE_QA_LISTING_AI_PILOT !== '1') throw new Error('Unsafe QA AI mode');
  if (process.env.NATIVE_QA_EXTERNAL_LISTINGS_PILOT !== undefined && process.env.NATIVE_QA_EXTERNAL_LISTINGS_PILOT !== '1') throw new Error('Unsafe QA external mode');
  const listingAiPilot = process.env.NATIVE_QA_LISTING_AI_PILOT === '1';
  const externalListingsPilot = process.env.NATIVE_QA_EXTERNAL_LISTINGS_PILOT === '1';
  if (externalListingsPilot) process.env.EXTERNAL_LISTINGS_PUBLIC_ENABLED = '1';
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-native-qa-'));
  startupStage = 'private-storage';
  await fs.chmod(root, 0o700);
  process.env.LISTING_MEDIA_STORAGE_ROOT = root;
  // No dist/index.js, dotenv, background workers, provider or store SDK setup.
  startupStage = 'module-express';
  const express = require('../../server/node_modules/express');
  startupStage = 'module-jwt';
  const jwt = require('../../server/node_modules/jsonwebtoken');
  startupStage = 'module-bcrypt';
  const bcrypt = require('../../server/node_modules/bcryptjs');
  startupStage = 'module-prisma';
  prisma = require('../../server/dist/lib/prisma').default;
  startupStage = 'module-jwt-config';
  const { decodeUserSessionJwt } = require('../../server/dist/lib/jwtConfig');
  startupStage = 'module-listing-rules';
  const { isListingId } = require('../../server/dist/lib/listingRules');
  startupStage = 'module-account-erasure';
  const { erasureIdentityHash } = require('../../server/dist/lib/accountErasure');
  startupStage = 'module-listing-storage';
  const { ListingMediaStorage } = require('../../server/dist/lib/listingMediaStorage');
  storage = new ListingMediaStorage();
  startupStage = 'listing-storage-ready';
  await storage.ready();
  startupStage = 'synthetic-seed';
  const runId = randomUUID(), actors = {};
  // One atomic fixture transaction prevents a partial, untracked seed on error.
  const password = 'Qa' + randomBytes(16).toString('hex') + '123';
  const passwordHash = await bcrypt.hash(password, 10);
  const users = await prisma.$transaction(['buyer', 'seller', 'third'].map(role => prisma.user.create({ data: {
    phoneNumber: 'native-qa-' + runId + '-' + role,
    email: runId + '-' + role + '@example.invalid',
    password: passwordHash, name: 'QA ' + role, isEmailVerified: true,
  }, select: { id: true, email: true, phoneNumber: true } })));
  users.forEach((user, index) => {
    userIds.push(user.id); hashes.add(erasureIdentityHash(user.id, 0));
    actors[['buyer', 'seller', 'third'][index]] = { ...user, password };
  });
  if (externalListingsPilot) {
    // A review-shaped, self-owned synthetic fixture lives only in the
    // isolated test database. It is never inserted in the seller Listing table.
    const { parseExternalCandidate } = require('../../server/dist/lib/externalListingIntake');
    const source = { canonicalHost: 'github.com', imageHost: 'raw.githubusercontent.com',
      authorizationRef: 'self:synthetic-native-qa', textReuseAllowed: true, imageReuseAllowed: true };
    const fixtureBase = 'https://raw.githubusercontent.com/HankHuang0516/wishlist-app/65f6630901a9b6eb8395b88d52d4c3d7eb20708c/mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png';
    const input = parseExternalCandidate({ sourceItemId: 'synthetic-' + runId,
      canonicalUrl: 'https://github.com/HankHuang0516/wishlist-app/blob/65f6630901a9b6eb8395b88d52d4c3d7eb20708c/mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png',
      imageUrl: fixtureBase,
      thumbnailUrl: 'https://raw.githubusercontent.com/HankHuang0516/wishlist-app/7632e69d5f03f8826aac4711d496ce54b815a4fe/mobile/qa-fixtures/synthetic-used-orange-desk-lamp-320.png',
      title: 'Native QA 外部檯燈', description: '合成來源商品，只供隔離原生地圖測試，不是真實待售商品。',
      priceTwd: 590, condition: 'USED', county: '新北市', district: '板橋區',
      observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }, source);
    const created = await prisma.$transaction(async tx => {
      const owner = await tx.externalListingSource.create({ data: { name: 'Synthetic native QA ' + runId,
        kind: 'SELLER_IMPORT', ...source, aiProcessingAllowed: false, enabled: true, enabledAt: new Date() } });
      const candidate = await tx.externalListingCandidate.create({ data: { ...input, sourceId: owner.id,
        status: 'APPROVED', approvalRef: 'review:synthetic-native-qa',
        approvedAuthorizationRef: owner.authorizationRef, approvedContentHash: input.contentHash, approvedAt: new Date() } });
      await tx.externalCandidateReviewEvent.create({ data: { candidateId: candidate.id, decision: 'APPROVED',
        contentHash: input.contentHash, reviewRef: 'review:synthetic-native-qa', authorizationRef: owner.authorizationRef } });
      await tx.wishlist.create({ data: { userId: actors.buyer.id, title: 'Native QA 外部比對清單', isPublic: false,
        items: { create: { name: '檯燈', maxPrice: 600, priceCurrency: 'TWD', aiStatus: 'SKIPPED' } } } });
      return { sourceId: owner.id, candidateId: candidate.id };
    });
    sourceIds.push(created.sourceId);
  }
  const callbackToken = listingAiPilot ? randomBytes(32).toString('hex') : null;
  if (listingAiPilot) {
    process.env.MINIMAX_PILOT_USER_ID = String(actors.buyer.id);
    process.env.MINIMAX_LISTING_AI_ENABLED = '1';
    process.env.MINIMAX_LISTING_AI_PILOT_USER_ID = String(actors.buyer.id);
    process.env.WISHLIST_MINIMAX_CALLBACK_TOKEN = callbackToken;
  }
  const identities = new Set(users.flatMap(user => [user.email, user.phoneNumber]));
  startupStage = 'actual-routes';
  const app = express();
  app.disable('x-powered-by');
  // Do not trust X-Forwarded-For: the real route rate limits remain effective.
  app.use(express.json({ limit: '64kb' }));
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (req.path === '/api/auth/login' && req.method === 'POST') {
        if (!identities.has(req.body?.phoneNumber)) return res.status(404).json({ errorCode: 'QA_FIXTURE_ONLY' });
        return next(); // Real login still verifies bcrypt, version and email.
      }
      if (req.path.startsWith('/api/auth/')) return res.status(503).json({ errorCode: 'QA_EXTERNAL_OPERATION_DISABLED' });
      const userRoute = req.path === '/api/users/me' && ['GET', 'DELETE'].includes(req.method) ||
        req.path === '/api/users/me/deletion-impact' && req.method === 'GET' ||
        req.path === '/api/users/me/password' && req.method === 'PUT' ||
        req.path === '/api/users/me/sessions/revoke' && req.method === 'POST' ||
        /^\/api\/users\/me\/deletion-operations\/[0-9a-f-]+(?:\/abandon)?$/.test(req.path) && ['GET', 'POST'].includes(req.method);
      const marketRoute = /^\/api\/(?:native-wishes|listings|listing-media|listing-reports|chat)(?:\/|$)/.test(req.path) ||
        externalListingsPilot && /^\/api\/external-listings(?:\/|$)/.test(req.path);
      const workerRoute = listingAiPilot && /^\/api\/internal\/minimax-vision(?:\/|$)/.test(req.path);
      if (!userRoute && !marketRoute && !workerRoute) return res.status(404).json({ errorCode: 'QA_ROUTE_DISABLED' });
      if (req.headers['x-api-key'] !== undefined) return res.status(401).json({ errorCode: 'QA_FIXTURE_ONLY' });
      if (!workerRoute && req.headers.authorization !== undefined && !(listingAiPilot && req.headers.authorization === 'Bearer ' + callbackToken)) {
        if (typeof req.headers.authorization !== 'string' || !/^Bearer [^\s]{1,8192}$/.test(req.headers.authorization)) throw new jwt.JsonWebTokenError('Invalid QA session');
        const claims = decodeUserSessionJwt(req.headers.authorization.slice(7));
        if (!userIds.includes(claims.id)) return res.status(401).json({ errorCode: 'QA_FIXTURE_ONLY' });
        hashes.add(erasureIdentityHash(claims.id, claims.authVersion));
        // No req.user injection: production auth middleware checks DB anew.
      }
      if (req.path === '/api/chat/conversations' && req.method === 'POST' && uuid.test(req.body?.listingId || '')) {
        const listing = await prisma.listing.findUnique({ where: { id: req.body.listingId }, select: { ownerUserId: true } });
        if (listing && !userIds.includes(listing.ownerUserId)) return res.status(403).json({ errorCode: 'QA_FIXTURE_ONLY' });
        const originalJson = res.json;
        res.json = function (body) {
          if (res.statusCode < 300 && uuid.test(body?.id || '')) roomIds.add(body.id);
          return originalJson.call(this, body);
        };
      }
      if (req.path === '/api/listing-reports' && req.method === 'POST' && isListingId(req.body?.listingId)) {
        // The production parser canonicalizes all supported UUID versions.
        // Use the same validation and case normalization BEFORE isolation.
        const listing = await prisma.listing.findUnique({ where: { id: req.body.listingId.toLowerCase() }, select: { ownerUserId: true } });
        if (listing && !userIds.includes(listing.ownerUserId)) return res.status(403).json({ errorCode: 'QA_FIXTURE_ONLY' });
      }
      if (/^\/api\/chat\/blocks\//.test(req.path) && !userIds.includes(Number(req.path.split('/').at(-1)))) return res.status(403).json({ errorCode: 'QA_FIXTURE_ONLY' });
      return next();
    } catch { return res.status(401).json({ errorCode: 'QA_FIXTURE_ONLY' }); }
  });
  for (const [route, file] of [['auth', 'authRoutes'], ['users', 'userRoutes'], ['native-wishes', 'nativeWishRoutes'], ['listings', 'listingRoutes'], ['listing-media', 'listingMediaRoutes'], ['listing-reports', 'listingReportRoutes'], ['chat', 'chatRoutes'],
    ...(externalListingsPilot ? [['external-listings', 'externalListingRoutes']] : [])]) {
    app.use('/api/' + route, require('../../server/dist/routes/' + file).default);
  }
  if (listingAiPilot) app.use('/api/internal/minimax-vision', require('../../server/dist/routes/minimaxRecognitionRoutes').default);
  app.use((_req, res) => res.status(404).json({ errorCode: 'QA_ROUTE_DISABLED' }));
  app.use((_failure, _req, res, _next) => res.status(400).json({ errorCode: 'QA_INVALID_REQUEST' }));
  server = createServer(app);
  startupStage = 'loopback-listener';
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const apiUrl = 'http://127.0.0.1:' + server.address().port;
  process.env.API_URL = apiUrl + '/api'; process.env.CLIENT_URL = apiUrl;
  timer = setTimeout(() => { void stop(); }, lifetime * 1000);
  send({ kind: 'ready', apiUrl, runId, actors, ...(listingAiPilot ? { callbackToken } : {}) });
}
startup = main();
startup.catch(() => {
  startupFailed = true;
  send({ kind: 'failed', stage: startupStage,
    unexpectedEnvironmentNames: startupStage === 'launch-guard' ? Object.keys(process.env).filter(key => !allowedEnv.has(key)) : [] });
  void stop();
});
