# Private batch draft removal

A seller reported that the native “移除照片” action left all three drafts in place. Read-only production inspection found a completed AI draft and at least one marketing job in REVIEW for each source. The shared removal guard incorrectly treated waiting for seller review as an active worker. The native legacy endpoint returned 404, while the app placed its generic error below the long form.

The backend now permits deletion of an unused private source with REVIEW generations. PENDING and PROCESSING workers, attached source photos, jobs bound to listings, and generated images already attached to a listing or wish remain protected. All permitted source/generated-image deletion and erasure tasks remain in one owner-locked transaction.

`RemovedMarketingUsage` keeps only the consumed root job ID, account relationship and original quota period when a delivered generation is erased. Both marketing creation APIs and availability include it in allowance calculations. Deleting private photos must not refund consumed generations. This is a preservation fix for the existing allowance, not activation or modification of paid entitlements. Account deletion cascades these rows. Other concurrent monetization work must preserve this invariant when integrating its allowance ledger.

The native update separately adds explicit whole-draft confirmation, version-bound durable removal receipts, read-only recovery after a lost reply or restart, and errors near the affected card. It must never infer deletion from a missing receipt or silently resend an unknown operation. The backend compatibility fix also serves the existing native DELETE endpoint.

Validation: targeted PostgreSQL removal/marketing suites: 40 passed. Full validator42 found two browser timeouts outside this patch; their unchanged full scenarios passed a focused rerun. Validator43 is in progress. Native confirmation/recovery is not yet accepted or released.
