# Source validity: Hank’s 2026-10-27 instruction

Hank selected 14 days for negative retail-price research, external supply intake, and archive source/photos. This supersedes their previous 7-day, 24/48-hour, 30-day and two-calendar-month limits. Windows use the original observation/check timestamp, never deployment time.

- Retail NOT_FOUND / NEEDS_SPEC observations: checkedAt + 14 days; migrate only old generated seven-day deadlines. Immutable old request hashes remain accepted for exact retries.
- External feed, intake, API, expiry worker, Web and native readers: observation window and maximum item expiry are 14 days. Preserve earlier source expiry, actual authorization expiry, sold/withdrawn state and review requirements. Previously STALE approvals are not restored automatically.
- Archive sources: both original-post age and check freshness use 14 elapsed days, including import/review validation. Photos/inventory use 14 days. Existing generated 48-hour photo deadlines are interpreted under the new policy without changing evidence bindings. Independently supplied other permission deadlines remain enforced.
- DB_MASTER retains its existing age exemption and sold/removed checks. Seller contact verification, listing lifetime, map check-in, billing, authentication and CP evaluation cache are outside this change.

Source edits for native are not delivery of a newly installed App binary.
