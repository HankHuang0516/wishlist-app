# External second-hand supply: private intake contract

This is an **admin-only staging path**, not a public product feed. No source or candidate is created by deployment, and imported rows do not enter `/api/listings`, the map, wish matching, or chat. Never represent an indexed source as an in-app seller.

## Source admission

`POST /api/external-intake/sources` requires the existing `x-admin-key` header. The source starts disabled. Store a human-verifiable authorization **reference**, not a token, contract body, private group transcript, or credential. Choose `PARTNER_FEED`, `LINE_OPT_IN`, or `SELLER_IMPORT`; specify the exact HTTPS canonical host and, only if image reuse is authorized, the exact image host. `textReuseAllowed` and `imageReuseAllowed` must be explicit booleans. A separate `POST /sources/:id/activate` with `{ "authorizationRef": "...", "confirmRights": true }` records the operator's authorization assertion. `POST /sources/:id/pause` immediately stops new intake. These API calls do not establish that a source is actually licensed; the operator must inspect the underlying permission before activation.

## Candidate intake

`POST /api/external-intake/sources/:id/candidates` accepts `{ "items": [...] }` with 1–50 records. Each item requires a source-stable `sourceItemId`, exact-host HTTPS `canonicalUrl`, original title and integer TWD price, `USED` or `NEW`, Taipei or New Taipei county and district, and UTC `observedAt`/`expiresAt`. Image and description may be supplied only within the registered reuse rights and image host. Observations older than 48 hours or more than five minutes in the future are refused; expiry must be ahead and within 30 days of observation. Prohibited goods and public contact information are refused. The batch is atomic, keyed by source plus external ID, and re-import never converts a rejected candidate into a public listing. Imported rows are private `PENDING_REVIEW` records. Synthetic examples in tests are not supply.

County and district must match the [Taipei City Government's 12 districts](https://www.gov.taipei/cp.aspx?n=1F076481DD9E556B) or [New Taipei City Government's 29 districts](https://www.ca.ntpc.gov.tw/new/home.jsp?id=0de11fd46b419ad1) (checked 2026-09-25). A syntactically plausible but cross-city or fictional district is rejected before a private candidate is created. This is a locality consistency check, not proof that the seller or item is actually there.

Every 15 minutes, a bounded background check marks expired candidates or candidates from paused sources `STALE`. A fresh re-import may return a stale candidate to review; rejected candidates remain rejected. This check does not fetch external sites or run AI.

## Remaining publication gates

Before any external candidate appears on the map, implement and verify: source-rights review, original availability recheck, district/coordinate validation without inventing an address, content and image-use review, price attribution, explicit source and ad/affiliate disclosure, deep link to the source (never fake chat), stale/offline removal within 24 hours, report/removal controls, and native + web UI. A periodic AI agent may help categorize or draft *private candidate enrichments* from authorized inputs; it must not invent a seller, stock, price, photo rights, or location, and must never publish by itself. No polling or AI enrichment is enabled until a real authorized source and operating terms are available.
