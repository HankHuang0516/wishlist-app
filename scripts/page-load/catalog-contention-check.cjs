#!/usr/bin/env node
'use strict';
/* Read model under contention: while the background worker re-derives the whole
 * public catalogue and writes keep arriving, is discovery still answered from the
 * read model, quickly and with the write made just before the read?
 *
 * About a minute after every server start, and every 24 hours after that, the
 * worker marks every public row and re-derives it in the background. On
 * production (2026-11-10) discovery took 10–12 s in exactly that minute and every
 * other API request waited with it.
 *
 * 1. Starts the real server build on the isolated test database, with the same
 *    fixed environment as local-stack.cjs (seed the database with that first).
 * 2. Several times a second gives one synthetic public source reference another
 *    title directly in the database, the way any write reaches the read model
 *    (the row stays valid: its content hash comes from the server's own rule),
 *    and a moment later, as an unrelated visitor would, asks discovery for
 *    exactly that title and for the plain first page. A tiny static file is read
 *    alongside, to see whether the server stalls.
 * 3. Does this while the server is quiet, during the worker's own re-derivation
 *    (60 s after start) and during --rounds further ones, started by inserting
 *    the same marks.
 *
 * FAIL when, during a re-derivation, a discovery answer takes longer than
 * --budget ms, does not show the change made before it, or fails; when the
 * server reports a read that the read model could not answer; or when the
 * worker's own report shows steps that are too large or longer than --budget ms
 * (a reader that needs a row of the step in progress waits for that step).
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { assertTestDatabase } = require('../assert-test-database.cjs');
const { startServer, waitFor, waitForCatalog } = require('./local-stack.cjs');

const root = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SYNTHETIC = { archiveItemId: { startsWith: 'PL' }, summary: '頁面載入檢查用的合成公開來源，不是真實商品。' };
const TOKEN = / zz[a-p]{10}$/;
// The fields the server's rule reads a stored source reference by (leadCurrent in sourceLeadRules.ts).
const FIELDS = ['archiveItemId', 'libraryFileId', 'archiveVersion', 'archiveSha256', 'title', 'summary', 'canonicalUrl', 'county', 'district', 'publicPlaceName', 'publicAddress', 'latitude', 'longitude', 'evidence'];
// The most rows one step of the worker rebuilds once the first build is done: 40 marks, and as many rows that have come due.
const STEP_ROWS = 80;

function parse(argv) {
  const values = { 'server-port': '18990', 'proxy-port': '18991', writes: '2', rounds: '3', budget: '1000', out: '' };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, '');
    if (!(name in values)) throw new Error('Unknown option: ' + argv[index]);
    values[name] = argv[++index];
  }
  const number = (name, min, max) => { const value = Number(values[name]); if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid --' + name); return value; };
  return { serverPort: number('server-port', 1024, 65535), proxyPort: number('proxy-port', 1024, 65535), writes: number('writes', 1, 20), rounds: number('rounds', 0, 20), budget: number('budget', 50, 60000), out: values.out };
}

const rank = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
function describe(samples) {
  const times = samples.map(sample => sample.ms).sort((a, b) => a - b);
  return times.length ? { count: times.length, median: Math.round(rank(times, 0.5)), p95: Math.round(rank(times, 0.95)), max: Math.round(times[times.length - 1]) } : { count: 0, median: null, p95: null, max: null };
}

async function main() {
  const options = parse(process.argv.slice(2));
  const database = process.env.TEST_DATABASE_URL;
  assertTestDatabase(database);
  for (const file of ['server/dist/index.js', 'client/dist/index.html']) if (!fs.existsSync(path.join(root, file))) throw new Error('Build first: ' + file + ' is missing');
  const { PrismaClient } = require(path.join(root, 'server/node_modules/@prisma/client'));
  const { parseLead } = require(path.join(root, 'server/dist/lib/sourceLeadRules'));
  // The content hash that keeps a row valid under another title, from the server's own rule.
  const hashFor = (row, title) => parseLead({ ...Object.fromEntries(FIELDS.map(field => [field, row[field]])), title, postedEarliestAt: row.postedEarliestAt?.toISOString() ?? null,
    postedLatestAt: row.postedLatestAt?.toISOString() ?? null, checkedAt: row.checkedAt?.toISOString() ?? null }, new Date(), row.recordOrigin === 'DB_MASTER').contentHash;
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  // The site address local-stack.cjs uses. Nothing listens on it here; it only keeps
  // the server's configuration, and with it the stored read model, the same.
  const base = 'https://127.0.0.1:' + options.proxyPort, origin = 'http://127.0.0.1:' + options.serverPort;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  let sent = 0;
  // A new client address every 30 requests, as separate visitors would have; the
  // server's own request budgets stay on.
  const get = route => new Promise(resolve => {
    const visitor = Math.floor(sent++ / 30), started = performance.now();
    const request = http.get(origin + route, { agent, headers: { 'x-forwarded-for': '10.20.' + (visitor % 250) + '.' + (1 + Math.floor(visitor / 250) % 250) + ', 10.30.0.1', 'x-forwarded-proto': 'https' } }, reply => {
      let text = ''; reply.setEncoding('utf8'); reply.on('data', chunk => { text += chunk; });
      reply.on('end', () => { let body = null; try { body = JSON.parse(text); } catch { /* Not JSON. */ } resolve({ status: reply.statusCode, ms: performance.now() - started, body }); });
    });
    request.setTimeout(60_000, () => request.destroy());
    request.on('error', () => resolve({ status: 0, ms: performance.now() - started, body: null }));
  });
  const marks = async () => (await db.$queryRawUnsafe(`SELECT count(*) FILTER (WHERE "priority" = 1)::int AS "background", count(*)::int AS "all" FROM "PublicCatalogDirty"`))[0];

  let server = null, restore = [];
  const samples = [], probes = [], lines = [], phases = [];
  let phase = 'quiet', measuring = false, startedAt = 0;
  const seconds = () => Math.round((Date.now() - startedAt) / 100) / 10;
  try {
    // An interrupted earlier run may have left its search words in the titles.
    for (const row of await db.externalSourceLead.findMany({ where: { ...SYNTHETIC, title: { contains: ' zz' } } })) if (TOKEN.test(row.title)) {
      const title = row.title.replace(TOKEN, '');
      await db.externalSourceLead.update({ where: { id: row.id }, data: { title, contentHash: hashFor(row, title) } });
    }
    const pool = (await db.externalSourceLead.findMany({ where: { ...SYNTHETIC, status: 'PUBLISHED' }, orderBy: { archiveItemId: 'asc' }, take: 400 })).filter(row => hashFor(row, row.title) === row.contentHash);
    if (pool.length < 100) throw new Error('No synthetic public catalogue in this database; seed it with local-stack.cjs first');

    server = startServer(database, options.serverPort, base, randomBytes(32).toString('hex'));
    startedAt = Date.now();
    for (const stream of [server.child.stdout, server.child.stderr]) {
      let rest = '';
      stream.on('data', chunk => {
        rest += chunk;
        for (let at = rest.indexOf('\n'); at >= 0; at = rest.indexOf('\n')) {
          const line = rest.slice(0, at); rest = rest.slice(at + 1);
          // The read model's own reports: counts and durations only.
          if (measuring && line.startsWith('Public catalogue')) lines.push({ at: seconds(), phase, line });
        }
      });
    }
    await waitFor(origin + '/web-version.json').catch(error => { throw new Error(error.message + '\n' + server.log.slice(-15).join('')); });
    const state = await waitForCatalog(database);
    if (state !== 'read model ready') throw new Error('The read model is not ready: ' + state);
    const quiet = await get('/api/discovery');
    if (quiet.status !== 200 || !quiet.body || !Number.isInteger(quiet.body.total)) throw new Error('Discovery did not answer (HTTP ' + quiet.status + ')');
    const total = quiet.body.total;
    console.log(`Server ready ${seconds()} s after start; ${total} public products. Waiting for the worker's own re-derivation (60 s after start)…`);
    measuring = true;

    let next = 0, flying = 0, skipped = 0;
    const every = Math.round(1000 / options.writes);
    const tick = async () => {
      if (flying >= 40) { skipped++; return; }
      flying++;
      // A word of letters only, so the title stays an ordinary one.
      const lead = pool[next++ % pool.length], word = 'zz' + randomBytes(5).toString('hex').replace(/\d/g, digit => 'ghijklmnop'[digit]), title = lead.title + ' ' + word;
      try {
        restore.push(lead);
        await db.$executeRawUnsafe(`UPDATE "ExternalSourceLead" SET "title" = $1, "contentHash" = $2 WHERE "id" = $3`, title, hashFor(lead, title), lead.id);
        // The reader is someone else: it arrives at any moment before the next write.
        await sleep(Math.random() * every);
        const during = phase;
        const [search, page] = await Promise.all([get('/api/discovery?limit=5&q=' + word), get('/api/discovery')]);
        const found = search.status === 200 && !!search.body && Array.isArray(search.body.items) && search.body.items.length === 1 && search.body.items[0].key === 'source:' + lead.id;
        samples.push({ phase: during, kind: 'search', at: seconds(), ms: search.ms, status: search.status, right: found });
        samples.push({ phase: during, kind: 'page', at: seconds(), ms: page.ms, status: page.status, right: page.status === 200 && !!page.body && page.body.total === total });
      } catch { samples.push({ phase, kind: 'search', at: seconds(), ms: 0, status: 0, right: false }); }
      finally { flying--; }
    };
    const ticker = setInterval(() => void tick(), every);
    const prober = setInterval(() => { const during = phase; void get('/web-version.json').then(reply => probes.push({ phase: during, ms: reply.ms, status: reply.status })); }, 250);

    // Follow the re-derivations by their marks: the worker's own first, then the ones started here.
    const follow = async (name, limit) => {
      const deadline = Date.now() + limit;
      while ((await marks()).background === 0) { if (Date.now() > deadline) throw new Error(name + ' did not start'); await sleep(100); }
      phase = name;
      const began = seconds();
      while ((await marks()).background > 0) { if (Date.now() > began * 1000 + startedAt + 300_000) throw new Error(name + ' did not finish in five minutes'); await sleep(100); }
      phases.push({ name, began, lasted: Math.round((seconds() - began) * 10) / 10 });
      phase = 'quiet';
      console.log(`  ${name}: began ${began} s after start, lasted ${phases[phases.length - 1].lasted} s`);
    };
    try {
      await follow('own re-derivation', 100_000 - (Date.now() - startedAt));
      for (let round = 1; round <= options.rounds; round++) {
        await sleep(3000);
        // The marks reconcileCatalog() makes: every public source row and every stored entry, once each.
        await db.$executeRawUnsafe(`INSERT INTO "PublicCatalogDirty" ("kind", "refId", "priority")
          SELECT 'listing', "id", 1 FROM "Listing" WHERE "status" IN ('ACTIVE', 'RESERVED')
          UNION SELECT 'source', "id", 1 FROM "ExternalSourceLead" WHERE "status" = 'PUBLISHED'
          UNION SELECT 'external', "id", 1 FROM "ExternalListingCandidate" WHERE "status" = 'APPROVED'
          UNION SELECT "kind", "refId", 1 FROM "PublicCatalogEntry"`);
        await follow('round ' + round, 10_000);
      }
      await sleep(3000);
    } finally { clearInterval(ticker); clearInterval(prober); }
    while (flying) await sleep(50);
    measuring = false;

    // ---- report ----
    const busy = samples.filter(sample => sample.phase !== 'quiet'), calm = samples.filter(sample => sample.phase === 'quiet');
    const row = (name, list) => { const d = describe(list); return `  ${name.padEnd(34)} ${String(d.count).padStart(5)} ${String(d.median ?? '-').padStart(7)} ${String(d.p95 ?? '-').padStart(7)} ${String(d.max ?? '-').padStart(7)} ${String(list.filter(s => s.ms > options.budget).length).padStart(7)} ${String(list.filter(s => s.status === 200 && !s.right).length).padStart(7)} ${String(list.filter(s => s.status !== 200).length).padStart(7)}`; };
    console.log(`\n  ${'discovery answers (ms)'.padEnd(34)} ${'reads'.padStart(5)} ${'median'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)} ${('>' + options.budget).padStart(7)} ${'wrong'.padStart(7)} ${'failed'.padStart(7)}`);
    for (const [name, list] of [['quiet', calm], ['during re-derivation', busy]]) for (const kind of ['search', 'page'])
      console.log(row(name + ', ' + (kind === 'search' ? 'the change just made' : 'plain first page'), list.filter(sample => sample.kind === kind)));
    const stall = during => describe(probes.filter(probe => (probe.phase !== 'quiet') === during));
    console.log(`  tiny static file: quiet median ${stall(false).median} ms, max ${stall(false).max} ms; during re-derivation median ${stall(true).median} ms, max ${stall(true).max} ms`);
    console.log(lines.length ? '  server reports:' : '  server reports: none');
    for (const entry of lines) console.log(`    ${String(entry.at).padStart(6)} s (${entry.phase}): ${entry.line}`);
    const reasons = [];
    const over = busy.filter(sample => sample.ms > options.budget).length, wrong = samples.filter(sample => sample.status === 200 && !sample.right).length, failed = samples.filter(sample => sample.status !== 200).length;
    // The server reports the 1st, 2nd, 4th, 8th… such read; its last report is the least there were.
    const bypassed = lines.filter(entry => entry.line.startsWith('Public catalogue bypassed'));
    const scanned = Math.max(0, ...bypassed.map(entry => Number((/reads so far (\d+)/.exec(entry.line) ?? [0, 1])[1])));
    // The worker reports each run of upkeep when it ends: its rows, its steps and its longest step.
    const upkeep = lines.map(entry => /^Public catalogue upkeep: (\d+) rows in (\d+) steps over [\d.]+ s, longest step (\d+) ms/.exec(entry.line)).filter(Boolean)
      .map(match => ({ rows: Number(match[1]), steps: Number(match[2]), longest: Number(match[3]) }));
    const widest = Math.round(Math.max(0, ...upkeep.map(run => run.rows / run.steps))), longest = Math.max(0, ...upkeep.map(run => run.longest));
    console.log(`  background steps: ${upkeep.length} runs reported, ${upkeep.reduce((sum, run) => sum + run.steps, 0)} steps, at most ${widest} rows a step on average, longest step ${longest} ms`);
    if (!busy.length) reasons.push('nothing was read during a re-derivation');
    if (over) reasons.push(over + ' discovery answers during a re-derivation took longer than ' + options.budget + ' ms');
    if (wrong) reasons.push(wrong + ' answers did not show the change made before them');
    if (failed) reasons.push(failed + ' requests failed');
    if (bypassed.length) reasons.push('the read model could not answer and the full scan was used for at least ' + scanned + ' reads');
    if (skipped) reasons.push(skipped + ' writes were not made because 40 were still waiting for their answers');
    // A reader that needs a row of the step in progress waits for that step.
    if (upkeep.length < phases.length) reasons.push('the server reported ' + upkeep.length + ' runs of upkeep for ' + phases.length + ' re-derivations, so the length of its steps is unknown');
    if (widest > STEP_ROWS) reasons.push('background steps averaged ' + widest + ' rows; one step is meant to rebuild ' + STEP_ROWS + ' at most');
    if (longest > options.budget) reasons.push('a background step took ' + longest + ' ms; a reader that needs a row of that step waits that long');
    console.log('\n' + (reasons.length ? 'FAIL: ' + reasons.join('; ') : `PASS: ${busy.length} discovery answers during ${phases.length} re-derivations, all from the read model, all showing the change just made, slowest ${describe(busy).max} ms; background steps of at most ${widest} rows on average, longest ${longest} ms`));
    if (options.out) fs.writeFileSync(options.out, JSON.stringify({ options, total, phases, verdict: reasons.length ? 'FAIL' : 'PASS', reasons, fullScanReadsAtLeast: scanned, backgroundSteps: { runs: upkeep, rowsPerStepAtMost: widest, longestMs: longest }, serverReports: lines,
      discovery: { quiet: { search: describe(calm.filter(s => s.kind === 'search')), page: describe(calm.filter(s => s.kind === 'page')) }, rederivation: { search: describe(busy.filter(s => s.kind === 'search')), page: describe(busy.filter(s => s.kind === 'page')) } },
      tinyFile: { quiet: stall(false), rederivation: stall(true) }, samples: samples.map(s => ({ ...s, ms: Math.round(s.ms) })) }, null, 1));
    process.exitCode = reasons.length ? 1 : 0;
  } finally {
    measuring = false;
    // Put the titles back and let the server absorb that before it stops.
    try {
      const seen = new Set(), rows = restore.filter(lead => !seen.has(lead.id) && seen.add(lead.id));
      if (rows.length) await db.$executeRawUnsafe(`UPDATE "ExternalSourceLead" l SET "title" = r."title", "contentHash" = r."hash" FROM unnest($1::text[], $2::text[], $3::text[]) AS r("id", "title", "hash") WHERE l."id" = r."id"`,
        rows.map(lead => lead.id), rows.map(lead => lead.title), rows.map(lead => lead.contentHash));
      if (server && server.child.exitCode === null) for (let attempt = 0; attempt < 100 && (await marks()).all > 0; attempt++) await sleep(300);
    } catch { console.error('The synthetic titles could not be put back; the next run does it'); }
    if (server && server.child.exitCode === null) { server.child.kill('SIGTERM'); await Promise.race([new Promise(resolve => server.child.once('exit', resolve)), sleep(5000)]); }
    agent.destroy();
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
