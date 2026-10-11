# Official auction compatibility — draft, not production enabled

This draft first isolates the evidence validator and tests. No route calls it yet. It does not insert inventory, publish a source, enable external listings or apply a migration.

The exact reviewed authority is recycledstuff.ntpc.gov.tw and its Product/Detail/UUID route. Original publication time remains null; the active auction window is a separate basis. Starting bid is not a fixed price, stock confirmation or image/display rights. Require item-bound period evidence, an active Asia/Taipei window represented by valid UTC instants, and the existing <=48-hour checkedAt rule when wired.

Remaining integration: nullable original-date columns with an additive CHECK, serializer/UI compatibility, existing source-sync archive observation pinning, real database roundtrip and client/mobile tests. Facebook original publication rules and all existing public rights/expiry gates remain unchanged.

Migration proposal: only ExternalSourceLead postedEarliestAt and postedLatestAt become nullable; non-auction rows still require both dates, official-auction rows require both null and exact evidence type. No backfill, data rewrite or fabricated original dates. Formal migration requires separate approval after integration testing.

Rollback: once a real auction null-date row exists, the old nonnullable generated Prisma client is unsafe. Do not SET NOT NULL, delete records or invent timestamps to roll back. Prefer a compatible nullable-client forward fix with the auction path disabled; reverting the schema is only safe after proving no null-date rows exist. Retain observations and IDs.

Actual address and coordinates must refer to the item's stated pickup facility. Facility footprint coordinates are not entrances, item stock locations or fake administrative-center points. OSM-derived coordinates remain candidates until provenance, ODbL attribution/segregation and database obligations are resolved. This draft provides no such storage segregation and accepts no candidate into production.

First real batch at most20; missing address/coordinates/evidence stays private candidate. No image scraping or rights inference. Qualified=false, stock=UNKNOWN and checkout=false must remain explicit. Current formal auction additions:0.

## Integration now prepared, not production enabled

Server parser/current checks, nullable DB migration, DTO, consignment read and Web/mobile parsers/displays are included for isolated CI. Explicit typed contracts distinguish original date bounds from active auction windows. Private evidence retains authorityRef/periodRef/sourceUrl; public DTO exposes only date facts. Source-sync full archive pinning accepts read_official_auction only with original_published_at=null, date_basis=ACTIVE_AUCTION_WINDOW and official_auction_evidence exactly matching the payload officialAuction object, in addition to all existing raw/full archive/payload/item/version hashes. These archive field names are a proposed explicit contract; real source sample adaptation must be checked before import.

Tests include full parser gates, UNKNOWN/qualifiedfalse/checkoutfalse, real isolated API/DB null serialization and expiry, DB CHECK rejection, Web/mobile disclosure, archive evidence substitution and existing Facebook regression. No formal migration or actual auction import has run. OSM way/Mapcarta candidates remain unsupported/unapproved for database reuse; no coordinate provenance exception is added.
