# Private store-image capture and AI recovery

The account request budget previously sent a valid MiniMax worker capability
to the user JWT authenticator. Private listing image GETs therefore returned
401 before the image controller could check its processing lease. Only an
exact image GET with the existing verified worker capability now reaches that
controller directly. The controller's account gate, active processing lease,
private-media checks and ordinary public request budget remain authoritative.

Wish recognition replies observed on 2026-10-27 arrived after the two-minute
wait. The default is now five minutes, within the existing bound. A retry can
read the exact previous immutable-photo job's validated late reply before
sending another request, or while waiting. It cannot reuse a different job.
The bounded local worker failure receipt contains only time, kind, UUID and a
whitelisted error code; it never records image URLs, prompts or credentials.

## Private demonstration catalog

Hank authorized twelve original-image demonstration products visible only to
the existing dedicated review account. `PRIVATE_STORE_PREVIEW` is an explicit
operator JSON setting with exactly `userId`, `listingIds`, and `expiresAt`.
The identity must equal `APP_REVIEW_DEMO_USER_ID`; IDs are a unique bounded
UUID allowlist, and expiry must be within seven days. Malformed, expired,
anonymous or other-account requests do not enable the preview.

Only the named account's allowlisted DRAFT records are read. Their database
status remains DRAFT: they do not become public listings or real inventory.
The existing native list, map, filters and wish matching render these actual
private records without replacing the UI or drawing results into screenshots.
Read responses are private/no-store. Only the owner receives the existing
opaque private Flickr image URLs for these original, non-personal test photos;
as with other private Flickr media, a holder of such a URL can fetch that image.
Catalog contents, prices and approximate demonstration locations are not
returned to other users. Ordinary anonymous listing/media reads retain their
existing protections. Disable the setting after capture if no further review
requires this catalog; retain source images, receipts and review evidence.

The preview is not a purchase entitlement, a publishing path, a source license,
or proof of real supply. Prices and provenance must be recorded separately.
Do not generate discount, matching, friend or AI-success states in artwork.

## Capture gates

Before delivery, verify real private image reads and a normal queued AI result,
successful wish recognition, camera repetition/cancellation, multi-photo
selection, draft restoration, all twelve map thumbnails and a selected card.
Verify anonymous and other-account catalog exclusion and no public ACTIVE
records. Store the evidence separately from the eight promotional PNGs.
Artwork must contain successful real UI and no QA/failed-state annotations.
No store upload or advertising is authorized before Hank's review.
