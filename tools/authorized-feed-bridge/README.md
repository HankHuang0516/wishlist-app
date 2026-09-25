# Authorized partner feed bridge (off by default)

This bridge does not crawl Facebook, LINE, or public pages. It polls **one explicitly configured partner JSON feed** whose host equals the registered source's `canonicalHost`. No source is configured or scheduled by the repository. Use it only after the source owner supplies S01–S03 (real item examples, stable IDs, rights to use text/images and optionally AI, and sold/removed updates) and an operator verifies the authorization record.

The feed must be HTTPS with no redirect, URL credential, query secret, or private-network DNS answer. It must return `application/json` and at most 2 MiB. The entire DNS-and-download operation has a 30-second deadline, including a server that keeps trickling bytes; a timed-out snapshot is not staged. A snapshot may contain up to 200 current items and 50 explicit withdrawals. Omitted items are **not** treated as sold; they expire through the server's 24-hour observation gate. Every item carries a fresh source-provided `observedAt` and `expiresAt`, and must satisfy the server's double-north, price, image-host, prohibited-content, and rights checks.

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

The bridge checks the live source ID, enabled state, authorization reference and host through the admin-only API **before fetching**. It sends SOLD/REMOVED first, then candidates in batches of at most 50. A sold ID absent from our index is recorded by hash as `NOT_FOUND`; the sync result reports `unmatchedWithdrawals`, while other known sold items are still hidden. The server writes compact intake receipts and stages changed candidates for private AI suggestions and human review. The bridge never calls approval or public-listing endpoints; unchanged previously reviewed items may retain their existing approval while freshly re-observed.

Runtime configuration is deliberately absent from this repository. `WISHLIST_FEED_SOURCE_ID`, `WISHLIST_FEED_AUTHORIZATION_REF`, `WISHLIST_FEED_HOST`, `WISHLIST_FEED_URL`, `WISHLIST_FEED_API_ORIGIN` (exact production origin), and `WISHLIST_FEED_ADMIN_KEY` must be injected securely at runtime. Never place the admin key in a feed URL, shell history, source file, report or partner system. Use `node tools/authorized-feed-bridge/poller.mjs --once` for a deliberate single synchronization, or `--run` for a 15-minute loop (`WISHLIST_FEED_INTERVAL_MINUTES` may be 15–1440). Neither command is installed as a background service yet; do not start it with a real source until its feed, rights, expiry and withdrawal behavior have been checked.

Host-only, no-source tests: `node --test tools/authorized-feed-bridge/poller.test.mjs`.

The opt-in PostgreSQL contract test `node --test tools/authorized-feed-bridge/poller.integration.mjs` requires a migrated, matching `DATABASE_URL` and `TEST_DATABASE_URL` accepted by the repository test-database guard, plus a current `server/dist` build. It uses a synthetic source, a substituted in-process API transport, a synthetic feed response, and a synthetic MiniMax worker callback: neither the partner host, production Railway origin, nor an AI model is contacted. It verifies private staging, an AI-eligible pending candidate, provenance receipt, a private AI suggestion that cannot override the source price or condition, rejection of an in-flight AI callback after SOLD, immediate withdrawal of an enriched candidate, and refusal to fetch after source pause; it never approves or publishes a candidate. Drop the exact temporary test database after checking fixture cleanup. Passing this test does **not** authorize or prove any real double-north supply or model-generated supplement.

An additional opt-in live-model test, `node --test tools/authorized-feed-bridge/poller.minimax.integration.mjs`, uses the same isolated database safeguards but calls MiniMax Code for an **owned synthetic orange-lamp image** pinned to a repository commit on `raw.githubusercontent.com`. It hashes the downloaded bytes against the local fixture before sending that image to MiniMax, stages one fake partner item through in-process admin routes, claims a real external-candidate AI job, posts the model's result, checks that the candidate remains private and the source's price/condition remain authoritative, then sends `SOLD` and checks withdrawal. It contacts GitHub for the owned test image and the configured MiniMax Connector, but never contacts a partner feed or production Railway. The test may take up to five minutes; run it only deliberately, on a freshly migrated exact test database, and remove that database after verifying cleanup. This does not establish any third-party image rights or authorize a real source.
