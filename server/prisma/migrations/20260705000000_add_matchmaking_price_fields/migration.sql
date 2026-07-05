-- Price-aware matchmaking (card_e1b8af79).
-- Additive & backward-compatible: three NULLABLE columns on Item. Existing rows
-- get NULL for all three, which the matchmaker treats as "no price" -> name/tags
-- only match (no exclusion). Money never flows through the platform (官方不介入);
-- these are match metadata only.
--
--   askPrice       : a SELLER's asking price on a listing.
--   maxPrice       : a BUYER's intended / max buy price on a wishlist item.
--   priceCurrency  : short currency code for askPrice/maxPrice; defaults to 'TWD'
--                    (distinct from the legacy `currency` column, which keeps its
--                    'USD' default so no existing behaviour changes).
--
-- IF NOT EXISTS guards keep this idempotent for `prisma db push`-style deploys.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "askPrice" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "maxPrice" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "priceCurrency" TEXT DEFAULT 'TWD';
