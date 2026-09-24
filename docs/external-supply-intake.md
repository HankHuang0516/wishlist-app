# External second-hand supply: private intake contract

This is an **admin-only staging path**, not a public product feed. No source or candidate is created by deployment, and imported rows do not enter `/api/listings`, the map, wish matching, or chat. Never represent an indexed source as an in-app seller.

## Source admission

`POST /api/external-intake/sources` requires the existing `x-admin-key` header. The source starts disabled. Store a human-verifiable authorization **reference**, not a token, contract body, private group transcript, or credential. Choose `PARTNER_FEED`, `LINE_OPT_IN`, or `SELLER_IMPORT`; specify the exact HTTPS canonical host and, only if image reuse is authorized, the exact image host. `textReuseAllowed`, `imageReuseAllowed`, and `aiProcessingAllowed` must be explicit booleans. AI processing additionally requires image reuse permission. A separate `POST /sources/:id/activate` with `{ "authorizationRef": "...", "confirmRights": true, "confirmAiProcessing": true }` records the operator's authorization assertion when AI processing is allowed; omit `confirmAiProcessing` when it is not. `POST /sources/:id/pause` immediately stops new intake and rejects outstanding AI callbacks. These API calls do not establish that a source is actually licensed; the operator must inspect the underlying permission before activation.

## Candidate intake

`POST /api/external-intake/sources/:id/candidates` accepts `{ "items": [...] }` with 1–50 records. Each item requires a source-stable `sourceItemId`, exact-host HTTPS `canonicalUrl`, original title and integer TWD price, `USED` or `NEW`, Taipei or New Taipei county and district, and UTC `observedAt`/`expiresAt`. Image and description may be supplied only within the registered reuse rights and image host. Observations older than 48 hours or more than five minutes in the future are refused; expiry must be ahead and within 30 days of observation. Prohibited goods and public contact information are refused. The batch is atomic, keyed by source plus external ID, and re-import never converts a rejected candidate into a public listing. Imported rows are private `PENDING_REVIEW` records. Synthetic examples in tests are not supply.

County and district must match the [Taipei City Government's 12 districts](https://www.gov.taipei/cp.aspx?n=1F076481DD9E556B) or [New Taipei City Government's 29 districts](https://www.ca.ntpc.gov.tw/new/home.jsp?id=0de11fd46b419ad1) (checked 2026-09-25). A syntactically plausible but cross-city or fictional district is rejected before a private candidate is created. This is a locality consistency check, not proof that the seller or item is actually there.

Every 15 minutes, a bounded background check marks expired candidates or candidates from paused sources `STALE`. A fresh re-import may return a stale candidate to review; rejected candidates remain rejected. This check does not fetch external sites or run AI.

## Optional private AI enrichment

The external AI queue is **off by default** (`MINIMAX_EXTERNAL_CANDIDATE_AI_ENABLED=1` enables it). It also requires the existing local MiniMax Code pull worker and worker token. Start the updated local poller before enabling the backend flag. The poller periodically claims only fresh `PENDING_REVIEW` candidates from enabled sources with both image reuse and AI-processing rights. It downloads only from the registered exact HTTPS image host, pins a public IPv4 address after DNS validation, rejects redirects, limits the image to 8 MiB, and does **not** forward the worker bearer token to the external host. A failed job may retry after 30 minutes, at most three claims; expired leases may be reclaimed. Re-import of changed content invalidates an outstanding job. Pausing a source, expiring a candidate, or changing its content causes late callbacks to be refused.

The AI result is a **private suggestion** visible through the admin candidates API. It cannot update the source-stated price or condition, manufacture seller/location/stock details, create a public `Listing`, or reach the map by itself. Human source/rights and availability review remains mandatory. Do not enable this flag until an actual authorized source and operating terms exist. Local synthetic fixtures exercise the queue but do not constitute real double-north supply.

## Remaining publication gates

Before any external candidate appears on the map, implement and verify: source-rights review, original availability recheck, district/coordinate validation without inventing an address, content and image-use review, price attribution, explicit source and ad/affiliate disclosure, deep link to the source (never fake chat), stale/offline removal within 24 hours, report/removal controls, and native + web UI. The private AI queue is implemented but off; it is not an authorization to scrape Facebook/LINE groups or publish AI-created stock.
