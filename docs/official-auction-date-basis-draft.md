# Official auction compatibility — draft, not production enabled

This draft first isolates the evidence validator and tests. No route calls it yet. It does not insert inventory, publish a source, enable external listings or apply a migration.

The exact reviewed authority is recycledstuff.ntpc.gov.tw and its Product/Detail/UUID route. Original publication time remains null; the active auction window is a separate basis. Starting bid is not a fixed price, stock confirmation or image/display rights. Require item-bound period evidence, an active Asia/Taipei window represented by valid UTC instants, and the existing <=48-hour checkedAt rule when wired.

Remaining integration: nullable original-date columns with an additive CHECK, serializer/UI compatibility, existing source-sync archive observation pinning, real database roundtrip and client/mobile tests. Facebook original publication rules and all existing public rights/expiry gates remain unchanged.

Migration proposal: only ExternalSourceLead postedEarliestAt and postedLatestAt become nullable; non-auction rows still require both dates, official-auction rows require both null and exact evidence type. No backfill, data rewrite or fabricated original dates. Formal migration requires separate approval after integration testing.

Rollback: once a real auction null-date row exists, the old nonnullable generated Prisma client is unsafe. Do not SET NOT NULL, delete records or invent timestamps to roll back. Prefer a compatible nullable-client forward fix with the auction path disabled; reverting the schema is only safe after proving no null-date rows exist. Retain observations and IDs.

Actual address and coordinates must refer to the item's stated pickup facility. Facility footprint coordinates are not entrances, item stock locations or fake administrative-center points. OSM-derived coordinates remain candidates until provenance, ODbL attribution/segregation and database obligations are resolved. This draft provides no such storage segregation and accepts no candidate into production.

First real batch at most20; missing address/coordinates/evidence stays private candidate. No image scraping or rights inference. Qualified=false, stock=UNKNOWN and checkout=false must remain explicit. Current formal auction additions:0.
