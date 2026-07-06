/**
 * Schema ⇄ migrations drift guard (regression test for the 2026-07-05 outage).
 *
 * INCIDENT: the price-aware-matchmaking migration
 *   (server/prisma/migrations/20260705000000_add_matchmaking_price_fields)
 * added `askPrice`, `maxPrice`, `priceCurrency` to the `Item` model in code, so the
 * generated Prisma Client SELECTed those columns — but the deploy pipeline had NO
 * migrate step (`start` was just `node dist/index.js`), so the columns were never
 * applied to the production DB. Every `/api/items/*` query then SELECTed columns the
 * DB didn't have → HTTP 500 on all reads → the whole app went down.
 *
 * The primary fix is `start: "prisma migrate deploy && node dist/index.js"` (deploys
 * now apply migrations, fail-closed). This test guards the PRECURSOR to that outage:
 * it fails the instant someone adds a scalar column to the `Item` model in
 * schema.prisma without a migration that creates/adds it on the DB — i.e. the exact
 * schema⇄DB drift that took the site down.
 *
 * PURE CODE — no live DB, no test-DB harness. It statically parses schema.prisma and
 * every migrations/  * /migration.sql, and cross-checks column coverage.
 */

import * as fs from 'fs';
import * as path from 'path';

const PRISMA_DIR = path.resolve(__dirname, '../../prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');
const MIGRATIONS_DIR = path.join(PRISMA_DIR, 'migrations');

const MODEL = 'Item';

/**
 * Extract every SCALAR column name declared for `model <MODEL>` in schema.prisma.
 *
 * A line inside the model block is a scalar column when:
 *   - it starts with an identifier (the field name), and
 *   - it is NOT a relation field (no `@relation`, and its type is not another model),
 *   - it is NOT a block attribute (`@@id`, `@@unique`, `@@index`, `@@map`, …), and
 *   - it is NOT a comment / blank line.
 *
 * Relation fields are recognised structurally: their type token resolves to a known
 * model name (e.g. `User`, `Wishlist`, `ItemWatch[]`) or the line carries `@relation`.
 * We derive the set of model names from the schema itself so this stays correct as
 * models are added.
 */
function parseSchemaModelNames(schema: string): Set<string> {
    const names = new Set<string>();
    const re = /^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(schema)) !== null) names.add(m[1]);
    return names;
}

function parseScalarColumnsForModel(schema: string, model: string, modelNames: Set<string>): string[] {
    const startRe = new RegExp(`^\\s*model\\s+${model}\\s*\\{`, 'm');
    const startMatch = startRe.exec(schema);
    if (!startMatch) {
        throw new Error(`model ${model} not found in schema.prisma`);
    }
    const bodyStart = startMatch.index + startMatch[0].length;
    const closeIdx = schema.indexOf('\n}', bodyStart);
    if (closeIdx === -1) {
        throw new Error(`could not find end of model ${model} block`);
    }
    const body = schema.slice(bodyStart, closeIdx);

    const columns: string[] = [];
    for (const rawLine of body.split('\n')) {
        // Strip trailing/inline comments and whitespace.
        const line = rawLine.replace(/\/\/.*$/, '').trim();
        if (line === '') continue;
        // Block attributes like @@id / @@unique / @@index / @@map.
        if (line.startsWith('@@')) continue;

        const tokens = line.split(/\s+/);
        const fieldName = tokens[0];
        const typeToken = tokens[1] ?? '';
        if (!fieldName || !typeToken) continue;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) continue;

        // Relation field → skip. Recognise via @relation attr OR a type that resolves
        // to another model (with optional `?`/`[]` modifiers).
        if (line.includes('@relation')) continue;
        const baseType = typeToken.replace(/[?\[\]]/g, '');
        if (modelNames.has(baseType)) continue;

        columns.push(fieldName);
    }
    return columns;
}

/**
 * Collect every column name the migrations create or add on `<MODEL>`:
 *   - `CREATE TABLE "Item" ( "col" TYPE, ... )`  → all quoted column names in the body
 *   - `ALTER TABLE "Item" ADD COLUMN [IF NOT EXISTS] "col" TYPE`
 */
function parseMigrationColumnsForModel(model: string): Set<string> {
    const covered = new Set<string>();
    if (!fs.existsSync(MIGRATIONS_DIR)) return covered;

    const migrationDirs = fs
        .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

    for (const dir of migrationDirs) {
        const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
        if (!fs.existsSync(sqlPath)) continue;
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // ── ADD COLUMN (quoted or unquoted col name) ──
        // ALTER TABLE "Item" ADD COLUMN [IF NOT EXISTS] "askPrice" ...
        const addRe = new RegExp(
            `ALTER\\s+TABLE\\s+"?${model}"?\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?`,
            'gi',
        );
        let am: RegExpExecArray | null;
        while ((am = addRe.exec(sql)) !== null) covered.add(am[1]);

        // ── CREATE TABLE "Item" ( ... ) ── grab the parenthesised body and pull the
        // leading quoted identifier from each definition line (column definitions
        // start with a quoted column name; table constraints start with CONSTRAINT/
        // PRIMARY/FOREIGN/UNIQUE which we skip).
        const createRe = new RegExp(`CREATE\\s+TABLE\\s+"?${model}"?\\s*\\(`, 'gi');
        let cm: RegExpExecArray | null;
        while ((cm = createRe.exec(sql)) !== null) {
            // Walk from the opening paren to its matching close paren.
            const open = sql.indexOf('(', cm.index);
            if (open === -1) continue;
            let depth = 0;
            let end = -1;
            for (let i = open; i < sql.length; i++) {
                if (sql[i] === '(') depth++;
                else if (sql[i] === ')') {
                    depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
            }
            if (end === -1) continue;
            const inner = sql.slice(open + 1, end);
            for (const rawDef of inner.split(',')) {
                const def = rawDef.trim();
                if (def === '') continue;
                // Skip table-level constraints.
                if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)\b/i.test(def)) continue;
                const colMatch = /^"([A-Za-z_][A-Za-z0-9_]*)"/.exec(def);
                if (colMatch) covered.add(colMatch[1]);
            }
        }
    }
    return covered;
}

describe('schema ⇄ migrations drift guard (Item model)', () => {
    it('every scalar Item column in schema.prisma is created/added by a migration', () => {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        const modelNames = parseSchemaModelNames(schema);
        const schemaColumns = parseScalarColumnsForModel(schema, MODEL, modelNames);
        const migrationColumns = parseMigrationColumnsForModel(MODEL);

        // Sanity: we actually parsed something (guards against a broken parser silently
        // passing). The Item model has many scalar columns and at least one migration.
        expect(schemaColumns.length).toBeGreaterThan(5);
        expect(migrationColumns.size).toBeGreaterThan(0);

        const uncovered = schemaColumns.filter((col) => !migrationColumns.has(col));

        expect(uncovered).toEqual([]);
        if (uncovered.length > 0) {
            // This branch never runs when the assertion above passes; it documents the
            // failure mode for readers.
            throw new Error(
                `Schema⇄migration drift: the following scalar column(s) exist on the ` +
                    `Item model in schema.prisma but NO migration creates/adds them on ` +
                    `the DB — deploying this would 500 every Item query (the 2026-07-05 ` +
                    `outage class): ${uncovered.join(', ')}. Add a migration ` +
                    `(prisma migrate dev) that ADDs these columns.`,
            );
        }
    });

    it('the 2026-07-05 price columns are specifically covered (incident regression)', () => {
        const migrationColumns = parseMigrationColumnsForModel(MODEL);
        for (const col of ['askPrice', 'maxPrice', 'priceCurrency']) {
            expect(migrationColumns.has(col)).toBe(true);
        }
    });
});
