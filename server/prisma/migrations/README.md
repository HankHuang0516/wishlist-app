# Prisma migrations — deploy workflow & one-time prod baselining

## Why this directory exists (the 2026-07-05 outage)

The app went fully down (every `/api/items/*` read → HTTP 500 → EClaw bridge 502)
because the price-aware-matchmaking migration
(`20260705000000_add_matchmaking_price_fields`, which adds `askPrice` / `maxPrice` /
`priceCurrency` to `Item`) was committed in code — so the generated Prisma Client
`SELECT`ed those columns — but the **deploy pipeline had no migrate step**, so the
columns were never applied to the production DB. Deployed code expected columns the DB
didn't have → every `Item` query threw.

Root cause chain: this repo had earlier switched from migrations to `prisma db push`
(commit `9aea187`, "Fix: Use prisma db push for Railway and remove sqlite migrations"),
then the security audit (`security-fixes.md`) correctly flagged `db push --accept-data-loss`
in `start` as disaster-class and it was removed — but the recommended replacement
(`prisma migrate deploy` + real migration files) was never wired up. So the DB stopped
tracking schema changes entirely until a hand-applied hotfix.

## The fix (this PR)

1. `server/package.json` `start` is now:
   `"prisma migrate deploy && node dist/index.js"`
   Railway runs `npm start` on every deploy, so pending migrations are now applied
   **before** the server boots, and **fail-closed**: if migrate fails the deploy fails
   rather than serving code against a schema the DB doesn't have.
2. A baseline `00000000000000_init` migration was generated from the current
   `schema.prisma` (`prisma migrate diff --from-empty`). It is the full table set —
   including `Item`'s base columns AND the three price columns — so the migrations
   directory is now a complete, authoritative record of the DB schema.
3. A regression test (`src/__tests__/schemaMigrationCoverage.test.ts`) fails CI the
   moment a scalar `Item` column is added to `schema.prisma` without a migration that
   creates/adds it — i.e. it catches the precursor to the outage before it ships.

## ⚠️ ONE-TIME manual step on the EXISTING production DB (do this ONCE)

Production was provisioned via `db push`, so its tables already exist but the
`_prisma_migrations` history table is empty. If `prisma migrate deploy` were allowed to
run `00000000000000_init` against that live DB it would error (`CREATE TABLE` /
`ADD CONSTRAINT` on objects that already exist). Baseline the existing DB by marking the
init migration as **already applied without running it** — run this ONCE against prod
(with prod `DATABASE_URL` set), before/at the first deploy of this PR:

```bash
cd server
npx prisma migrate resolve --applied 00000000000000_init
```

After that, `prisma migrate deploy` will skip the (already-applied) baseline and apply
only genuinely-pending migrations (e.g. `20260705000000_add_matchmaking_price_fields`,
which is itself idempotent via `ADD COLUMN IF NOT EXISTS`). A brand-new/empty DB needs
no manual step — `migrate deploy` runs the full chain from the baseline.

## Going forward — how to change the schema

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <change>` locally (generates a migration file).
3. Commit the schema change AND the new `migrations/<...>/migration.sql` together.
   The drift-guard test will fail if you add an `Item` column without a migration.
