/** Executes the exact migration against owned legacy fixture schemas, never
 * public/production tables. Invalid old identities must abort atomically. */
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import prisma from '../../lib/prisma';
require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated DB URLs required');
let schema = '';
const migration = path.resolve(__dirname, '../../..', 'prisma/migrations/20261001050000_listing_create_receipts/migration.sql');
const photoMigration = path.resolve(__dirname, '../../..', 'prisma/migrations/20261001073000_photo_upload_receipts/migration.sql');
const sql = (query: string) => prisma.$executeRawUnsafe(query);
beforeEach(async () => {
    schema = 'receipt_migration_' + randomUUID().replace(/-/g, '');
    if (!/^receipt_migration_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe fixture schema');
    await sql(`CREATE SCHEMA "${schema}"`);
    await sql(`CREATE TABLE "${schema}"."User" ("id" INTEGER PRIMARY KEY)`);
    await sql(`CREATE TABLE "${schema}"."Listing" ("id" TEXT PRIMARY KEY, "ownerUserId" INTEGER NOT NULL, "clientListingId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL)`);
    await sql(`CREATE TABLE "${schema}"."ListingMedia" ("id" TEXT PRIMARY KEY, "ownerUserId" INTEGER NOT NULL, "clientUploadId" TEXT)`);
    await sql(`INSERT INTO "${schema}"."User" VALUES (1), (2)`);
});
afterEach(async () => { if (/^receipt_migration_[a-f0-9]{32}$/.test(schema)) await sql(`DROP SCHEMA "${schema}" CASCADE`); schema = ''; });
afterAll(async () => prisma.$disconnect());
async function seed(clientId: string = randomUUID(), hash = 'a'.repeat(64), owner = 1, listingId: string = randomUUID()) {
    await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."Listing" VALUES ($1,$2,$3,$4,$5::timestamp)`, listingId, owner, clientId, hash, '2025-01-02 03:04:05.678');
    return { clientId, hash, listingId };
}
function migrate(file = migration) {
    try {
        execFileSync(process.env.PSQL_BIN || 'psql', ['--no-psqlrc', '--dbname', process.env.TEST_DATABASE_URL!, '--set', 'ON_ERROR_STOP=1', '--file', file], {
            env: { ...process.env, PGOPTIONS: '-c search_path=' + schema }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }); return true;
    } catch { return false; }
}
const rows = <T = Record<string, unknown>>(query: string) => prisma.$queryRawUnsafe<T[]>(query);
describe('legacy listing receipt migration', () => {
    it('backfills the original identity/hash/timestamp, canonicalizes UUID case, and survives listing erasure', async () => {
        const first = await seed(randomUUID().toUpperCase()), second = await seed(first.clientId.toLowerCase(), 'b'.repeat(64), 2);
        expect(migrate()).toBe(true);
        const records = await rows(`SELECT * FROM "${schema}"."ListingCreateReceipt" ORDER BY "userId"`);
        expect(records).toEqual([expect.objectContaining({ id: first.listingId, userId: 1, clientListingId: first.clientId.toLowerCase(), requestHash: first.hash, state: 'CREATED', listingId: first.listingId, createdAt: new Date('2025-01-02T03:04:05.678Z') }),
            expect.objectContaining({ id: second.listingId, userId: 2 })]);
        expect((await rows(`SELECT "clientListingId" FROM "${schema}"."Listing" WHERE "ownerUserId"=1`))[0].clientListingId).toBe(first.clientId);
        await sql(`DELETE FROM "${schema}"."Listing"`); expect(await rows(`SELECT "id" FROM "${schema}"."ListingCreateReceipt"`)).toHaveLength(2);
        await sql(`DELETE FROM "${schema}"."User" WHERE "id"=1`); expect(await rows(`SELECT "userId" FROM "${schema}"."ListingCreateReceipt"`)).toEqual([{ userId: 2 }]);
    });
    it.each(['invalid-client-id', 'invalid-hash', 'invalid-listing-id', 'case-collision'])('rolls back all receipt DDL and retains every legacy row for %s', async invalid => {
        const first = await seed(invalid === 'invalid-client-id' ? 'not-a-uuid' : randomUUID(), invalid === 'invalid-hash' ? 'legacy-dummy' : 'a'.repeat(64), 1, invalid === 'invalid-listing-id' ? 'not-a-listing-uuid' : randomUUID());
        if (invalid === 'case-collision') await seed(first.clientId.toUpperCase());
        const before = await rows(`SELECT * FROM "${schema}"."Listing" ORDER BY "id"`);
        expect(migrate()).toBe(false);
        expect((await rows(`SELECT to_regclass('"${schema}"."ListingCreateReceipt"')::text AS "table"`))[0].table).toBeNull();
        expect(await rows(`SELECT * FROM "${schema}"."Listing" ORDER BY "id"`)).toEqual(before);
    });
});

describe('legacy photo upload receipt migration', () => {
    it('preserves legacy rows without inventing source hashes and supports isolated owners/cascade', async () => {
        const id = randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."ListingMedia" VALUES ($1,1,$2),($3,2,$4),($5,1,NULL)`, randomUUID(), id.toUpperCase(), randomUUID(), id, randomUUID());
        const before = await rows(`SELECT * FROM "${schema}"."ListingMedia" ORDER BY "id"`);
        expect(migrate(photoMigration)).toBe(true);
        expect(await rows(`SELECT * FROM "${schema}"."PhotoUploadReceipt"`)).toEqual([]);
        expect(await rows(`SELECT * FROM "${schema}"."ListingMedia" ORDER BY "id"`)).toEqual(before);
        await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."PhotoUploadReceipt" ("id","userId","clientUploadId","requestHash","state") VALUES ($1,1,$2::uuid,$3,'ABANDONED'),($4,2,$2::uuid,$3,'ABANDONED')`, randomUUID(), id, 'a'.repeat(64), randomUUID());
        await sql(`DELETE FROM "${schema}"."User" WHERE "id"=1`);
        expect(await rows(`SELECT "userId" FROM "${schema}"."PhotoUploadReceipt"`)).toEqual([{userId:2}]);
    });
    it.each(['invalid-key', 'case-collision'])('rolls back new photo DDL on %s without rewriting legacy media', async invalid => {
        const id = randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."ListingMedia" VALUES ($1,1,$2)`, randomUUID(), invalid === 'invalid-key' ? 'legacy-bad' : id);
        if(invalid === 'case-collision') await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."ListingMedia" VALUES ($1,1,$2)`, randomUUID(), id.toUpperCase());
        const before = await rows(`SELECT * FROM "${schema}"."ListingMedia" ORDER BY "id"`);
        expect(migrate(photoMigration)).toBe(false);
        expect((await rows(`SELECT to_regclass('"${schema}"."PhotoUploadReceipt"')::text AS "table"`))[0].table).toBeNull();
        expect(await rows(`SELECT * FROM "${schema}"."ListingMedia" ORDER BY "id"`)).toEqual(before);
    });
});
