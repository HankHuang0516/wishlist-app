# Authorized partner feed bridge (off by default)

This bridge does not crawl Facebook, LINE, or public pages. It polls **one explicitly configured partner JSON feed** whose host equals the registered source's `canonicalHost`. No source is configured or scheduled by the repository. Use it only after the source owner supplies S01–S03 (real item examples, stable IDs, rights to use text/images and optionally AI, and sold/removed updates) and an operator verifies the authorization record.

The feed must be HTTPS with no redirect, URL credential, query secret, or private-network DNS answer. It must return `application/json` and at most 2 MiB. The entire DNS-and-download operation has a 30-second deadline, including a server that keeps trickling bytes; a timed-out snapshot is not staged. A snapshot may contain up to 200 current items and 50 explicit withdrawals. Omitted items are **not** treated as sold; they expire through the server's 24-hour observation gate. Every item carries a fresh source-provided `observedAt` and `expiresAt`, and must satisfy the server's double-north, price, image-host, prohibited-content, and rights checks.

Use the same canonical `sourceItemId` (1–160 characters) for an item and all later `SOLD`/`REMOVED` signals. Leading/trailing spaces, repeated whitespace and control characters are rejected before any intake write; otherwise the API could normalize two feed strings into one database key across separate batches.

Envelope version 1:

```json
{
  "version": 1,
  "sourceId": "f38a84b3-82e8-44a3-9cc0-1f2667655f02",
  "authorizationRef": "contract:example-only",
  "generatedAt": "2026-09-25T03:00:00Z",
  "items": [{
    "sourceItemId": "source-stable-item-1",
    "canonicalUrl": "https://partner.example.com/items/source-stable-item-1",
    "imageUrl": "https://images.example.com/items/source-stable-item-1.jpg",
    "thumbnailUrl": "https://images.example.com/items/source-stable-item-1-small.jpg",
    "title": "二手檯燈範例（不可作真實供給）",
    "description": "此為格式範例，不是真實待售商品。",
    "priceTwd": 590,
    "condition": "USED",
    "county": "新北市",
    "district": "板橋區",
    "observedAt": "2026-09-25T03:00:00Z",
    "expiresAt": "2026-09-28T03:00:00Z"
  }],
  "withdrawals": [{ "sourceItemId": "previous-stable-item-2", "reason": "SOLD" }]
}
```

The bridge checks the live source ID, enabled state, authorization reference, authorization expiry and host through the admin-only API **before fetching**. A separate `--preflight` mode fetches the partner snapshot and asks the server to validate every candidate batch against the same rights, district, content, price and freshness rules used at intake, without writing candidates, withdrawal signals or intake receipts. It returns counts only, not item text, image URLs or credentials. This is a readiness check, not a promise that a later sync will still pass: source rights, listing availability and timestamps can change in between. During real sync, it sends SOLD/REMOVED first so already-approved sold goods hide promptly, then validates **all** candidate batches before staging any one batch. A sold ID absent from our index is recorded by hash as `NOT_FOUND`; the sync result reports `unmatchedWithdrawals`, while other known sold items are still hidden. The server writes compact intake receipts and stages changed candidates for private AI suggestions and human review. The bridge never calls approval or public-listing endpoints; unchanged previously reviewed items may retain their existing approval while freshly re-observed.

Runtime configuration is deliberately absent from this repository. `WISHLIST_FEED_SOURCE_ID`, `WISHLIST_FEED_AUTHORIZATION_REF`, `WISHLIST_FEED_HOST`, `WISHLIST_FEED_URL`, `WISHLIST_FEED_API_ORIGIN` (exact production origin), and `WISHLIST_FEED_ADMIN_KEY` must be injected securely at runtime. Never place the admin key in a feed URL, shell history, source file, report or partner system. Use `node tools/authorized-feed-bridge/poller.mjs --preflight` first; this requires an activated authorized source and the server version with the read-only candidate validation endpoint. `WISHLIST_FEED_SYNC_ENABLED` is **off by default**: preflight works with it unset or `0`, while `--once` and `--run` fail before any API/feed request unless it is explicitly `1`. Only after reviewing preflight and the real source's withdrawal behavior should an operator set that flag and use `--once` for one deliberate synchronization, or `--run` for a 15-minute loop (`WISHLIST_FEED_INTERVAL_MINUTES` may be 15–1440). Neither sync command is installed as a background service yet; do not start it with a real source until its feed, rights, expiry and withdrawal behavior have been checked.

For a future cloud schedule, use a **separate** Railway cron service running this repository's one-shot `node tools/authorized-feed-bridge/poller.mjs --once` every 15 minutes, not `--run` and not the web API service. [`Dockerfile.cron`](Dockerfile.cron) packages only the two dependency-free bridge modules and runs as an unprivileged user. Build it from the **repository root** (`docker build -f tools/authorized-feed-bridge/Dockerfile.cron .`); do not change the existing web service's build, start command or domain. The new service must use the repository root as its build context and this explicit Dockerfile path, with no public domain, no database connection and no inherited web-service variables. Railway requires cron processes to exit; a still-active previous run causes the next trigger to be skipped.

Before creating or scheduling a live service, complete S01–S03 rights and real-stock review; create/activate only that attributed source, run `--preflight` with `WISHLIST_FEED_SYNC_ENABLED=0`, inspect actual withdrawal behavior, then perform one observed `--once` with the flag set to `1`. Only then set the separate service's [UTC cron schedule](https://docs.railway.com/cron-jobs) to `*/15 * * * *`, injecting **only** its runtime `WISHLIST_FEED_*` variables and admin key securely. Check the effective Dockerfile, start command, environment, schedule and absence of a domain on the new service before applying its deployment: this repository's legacy root `railway.json` says `npm start` for the existing web app and must not override the cron command. Railway's new services use Infrastructure as Code or service settings rather than newly opting into the [deprecated `railway.json` Config as Code](https://docs.railway.com/config-as-code); do not assume that adding a second `railway.json` would safely configure the cron service. Review each scheduled exit status, private intake counts and skipped-run state. A cloud feed poll does not itself run MiniMax, whose separate local worker must remain available for image enrichment. **The image is dormant packaging only; no cron service, source variables, or real feed has been created by this repository change.**

Host-only, no-source tests: `node --test tools/authorized-feed-bridge/poller.test.mjs`.

The opt-in PostgreSQL contract test `node --test tools/authorized-feed-bridge/poller.integration.mjs` requires a migrated, matching `DATABASE_URL` and `TEST_DATABASE_URL` accepted by the repository test-database guard, plus a current `server/dist` build. It uses a synthetic source, a substituted in-process API transport, a synthetic feed response, and a synthetic MiniMax worker callback: neither the partner host, production Railway origin, nor an AI model is contacted. It verifies private staging, an AI-eligible pending candidate, provenance receipt, a private AI suggestion that cannot override the source price or condition, rejection of an in-flight AI callback after SOLD, immediate withdrawal of an enriched candidate, and refusal to fetch after source pause; it never approves or publishes a candidate. Drop the exact temporary test database after checking fixture cleanup. Passing this test does **not** authorize or prove any real double-north supply or model-generated supplement.

An additional opt-in live-model test, `node --test tools/authorized-feed-bridge/poller.minimax.integration.mjs`, uses the same isolated database safeguards but calls MiniMax Code for an **owned synthetic orange-lamp image** pinned to a repository commit on `raw.githubusercontent.com`. It hashes the downloaded bytes against the local fixture before sending that image to MiniMax, stages one fake partner item through in-process admin routes, claims a real external-candidate AI job, posts the model's result, checks that the candidate remains private and the source's price/condition remain authoritative, then sends `SOLD` and checks withdrawal. It contacts GitHub for the owned test image and the configured MiniMax Connector, but never contacts a partner feed or production Railway. The test may take up to five minutes; run it only deliberately, on a freshly migrated exact test database, and remove that database after verifying cleanup. This does not establish any third-party image rights or authorize a real source.
