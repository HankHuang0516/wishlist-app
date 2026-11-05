# Public listing report

`GET https://wishlist-app-production.up.railway.app/api/public/listing-report`

Key-free, read-only aggregates of actual listing results, for dashboards and
cloud agents. The optional `hours` parameter (1–2160, default 168) sets how many
hourly points are returned. It only slices a cached result, so it cannot add
database load.

## What counts

| Term | Meaning |
|---|---|
| Successful listing (`firstPublished`) | The first success event of a record: `PUBLISH`, or `AUTO_REFERENCE_SAVE` with `autoDisplay.state = DISPLAYED`. Both are written in the same transaction as the status change. |
| De-duplication | One per record, at its earliest success event. A retried `operationId` replays the stored result and adds no event. |
| Republish (`republishedNotCounted`) | Any later success event for the same record, such as after a recheck or price fix. Never added to successes. |
| Withdrawn or sold | History is not rewritten. See `firstPublishedNotPublishedNow` and the daily `stillPublishedNow`. |
| `0` vs `null` | Inside coverage, `0` means nothing was published through the records flow, whose events are written with the status change. The older `/import` route writes no event, and its rows appear only in `publishedWithoutPublishEvent`. `null` means unknown, such as before the event log began. |
| Legacy rows (`publishedWithoutPublishEvent`) | Rows written by the older import route. They have no publish time and are excluded from successes. |
| `publiclyVisible` | The same eligibility check as public search and `/api/source-leads/summary`. Scanned after the other counts, so it can differ from `records.published` by a few. `null` with `VISIBILITY_CHECK_INCOMPLETE` if the scan fails or exceeds 15 seconds. |
| `waitingToPublish` | Records now saved as private pending. Its times use the last update, which photo retries and re-saves also bump, so they do not measure the wait. |

All counts come from `SourceLeadRecordEvent` and `ExternalSourceLead`.
Candidates, captures and local pipeline receipts are never used.

## Time

Days are `Asia/Taipei` and start at 16:00Z. Timestamps are UTC ISO 8601. Hourly
points are UTC hours, which are also Taipei hours because the offset is exactly
8 hours. `partial: true` marks an hour or day that has not ended.

## Freshness

| Field | Meaning |
|---|---|
| `asOf` | Database snapshot time. Refreshed at most every 120 seconds, on demand. |
| `freshness.state` | `fresh`, or `stale` when the latest refresh failed and the previous result is being served, for up to 900 seconds. |
| `secondsSinceLatestFirstPublish` | How long since a new listing. A long lull is not stale data. |

The event log has no purge, so coverage runs from the first event to now.

## Unavailable values

These are `{ value: null, state: "unavailable", reason }`, never zero, because
the server does not hold them:

| Field | Reason | Why |
|---|---|---|
| `live.processing`, `pipelineOutcomes.skipped` | `PIPELINE_STATE_NOT_ON_SERVER` | Run state and skip reasons exist only in the local pipeline's files. |
| `pipelineOutcomes.failed`, `pipelineOutcomes.failureReasons` | `ATTEMPTS_NOT_RECORDED_ON_SERVER` | Rejected writes return an error but are not stored. |

`target` is also unavailable unless `LISTING_REPORT_TARGET_PER_HOUR` is set to a
positive integer. A client that knows the target can compute the gap itself from
`measuredRates`. `estimates` is `null`: the report contains no estimates.

## Errors

| Status | `errorCode` | When |
|---|---|---|
| 400 | `INVALID_QUERY` | Unknown parameter or `hours` out of range. |
| 405 | `METHOD_NOT_ALLOWED` | Anything but GET, including HEAD. `Allow: GET` is set. CORS preflight is answered earlier by the site-wide handler. |
| 429 | `LISTING_REPORT_RATE_LIMIT` | More than 60 requests per minute from one client. |
| 429 | `RATE_LIMIT_EXCEEDED` | The existing site-wide 500 per 15 minutes. |
| 503 | `LISTING_REPORT_UNAVAILABLE` | No result newer than 900 seconds could be served. No numbers are returned. `Retry-After` is set. |
| 503 | `LISTING_REPORT_DISABLED` | `LISTING_REPORT_DISABLED=1`, the off switch. |

## Public scope

The response holds counts and timestamps only. It has no per-platform breakdown,
titles, URLs, sellers, photos, record IDs or internal error text. Adding a field
means updating the allow-list in `publicListingReport.test.ts`, which is the
point at which to check that the field is safe to publish.
