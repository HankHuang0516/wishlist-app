# Private App Review demonstrations

Production defaults to the ordinary non-sale restriction. `PRIVATE_REVIEW_DEMO_ROOMS`
may explicitly register up to ten **existing synthetic** conversations as tuples:
`conversationId`, `listingId`, `buyerUserId`, `sellerUserId`. Configuration is an
operator-only JSON array. It contains public resource identifiers, never passwords,
tokens, email addresses or signing material. Missing, malformed, duplicate or
incomplete configuration grants no demonstration capability.

Before enabling, verify the exact accounts are dedicated synthetic review actors,
the product owner matches the seller, both participants exist, and the title starts
with `【QA測試非販售】`. Preserve that marker and a clear instruction not to pay or
travel. A display name, email domain or request parameter alone grants nothing.

Only the registered existing room and pair can demonstrate new text/photo messages
and versioned meetup operations. Authentication, member checks, pair locks, block
enforcement, replay receipts, account erasure, photo authorization and lifecycle
checks remain active. This mode cannot create new rooms for unrelated users. Private
listing details require the actual registered conversation and current membership;
owner history access remains available.

Configured product IDs are excluded from public discovery, storefronts and product
interest counts even if a damaged marker reaches storage. Normal editing cannot
strip the marker. Chat photos retain member-only, no-store delivery. Synthetic
message and meetup activity never queues provider push notifications; ordinary
notifications retain their existing path. Use a real test account outside these
fixtures for physical push acceptance.

Review notes must disclose that these are private, non-sale demonstrations. They
must not describe them as real stock, public popularity, completed transactions or
physical-device verification. This configuration does not publish store metadata,
waive privacy declarations or close any required release gate.

## Configured, unavailable purchase drafts

App Store Connect currently has unsubmitted `MISSING_METADATA` drafts for
`wishlist_marketing_10`, `wishlist_sponsor_90` and `wishlist_premium_monthly`.
Their existence does not mean a purchase flow is available or tested. Checkout
must remain disabled and none of these products may be selected for this release's
review unless their ordinary purchase and submission requirements are completed.

When these drafts exist, `scripts/app-review-preflight.cjs` requires
`--business-receipt PATH`. The private receipt must contain `appId`,
`mode: "disabled-draft-products"`, the exact current `versionId`, `nativeTree` and
`serverTree`, `verifiedAt` within24hours, `paidPurchasesAvailable: false`,
`productsRequestedForReview: false`, all current products as
`{id, kind, productId, state}` (`kind` is `iap` or `subscription`), and
`disclosureText`. That complete disclosure must name every draft SKU and appear
verbatim in the actual review notes. The command independently fetches the live
inventory and compares it against the receipt. Missing/changed inventory,
submitted/approved products, stale evidence, enabled checkout or missing notes
block submission. An empty inventory retains the original zero-product checks.

This business receipt grants no exception for physical-device recording, current
binary/UI evidence, App Privacy, attachments, demo readiness or CI. Historical
recording approval remains bound to the exact19artifact;20requires its own scoped
human decision when its concrete submission is prepared.
