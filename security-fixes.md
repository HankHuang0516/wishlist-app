# Security Audit Report (Vibe Coding Shield)

**Project Info:** Wishlist App (Node.js/Express + React + Prisma)
**Auditor:** Code Guardian Aegis (AI Agent)
**Date:** 2026-01-01

## 2026-10-02 Legacy detail operation follow-up

Detail list edits preserve children when the legacy ACK omits them; gift/hide actions validate exact identity and requested booleans against the actual item endpoint. Account/API encrypted minimal markers, synchronous gates and scoped late-response guards prevent automatic mutation replay after unknown responses. Current-state reads are explicitly not historical receipts. Public DTOs do not invent private AI status or capacity. Share links omit query/fragment parameters, and cancelling native share no longer copies automatically. Source-blocked help retains only a sanitized 403 marker.

Local page/store tests and real-handler browser evidence cover commit-then-502 reload recovery and third-party purchase conflicts. Remaining legacy modal edit/delete, URL/photo creation, clone, provider and production/PWA/device checks are not covered by this batch's claim; no native or server code changed.

## 2026-10-02 Legacy wishlist operation follow-up

The dashboard persists minimal encrypted account/API-scoped list mutation markers before sending and uses a synchronous gate across privacy/delete operations. Local operation IDs fence stale CAS cleanup without pretending to be server receipts. Privacy responses must match list, owner and requested visibility. Deletion adds `id`/`deleted` after the existing transaction, preserving the old message; own list read/update/delete responses are private/no-store. Unknown results survive reload and only offer current-state read plus explicit acknowledgment/cleanup, with the absence of historical receipts clearly stated. No automatic mutation replay or plaintext fallback was added.

Capacity no longer defaults after profile read failure; fresh own identity and native creation bounds are checked. Wish edit/toggle responses must match requested fields. Late account replies cannot modify the replacement view or clear the original marker. Real storage/CAS/isolation and HTTP owner-denial/deletion-ACK regressions passed. DEV browser evidence includes commit-then-502 recovery and manual wish changes; permanent deletion was only cancelled in the browser, and production/PWA/native-device checks remain pending.

## 2026-10-02 Web account flow follow-up

Web login now verifies the returned session identity against a fresh private profile before admission. Verification links require explicit confirmation and discard returned JWTs instead of replacing the active account. Registration discards unverified JWTs and validates expected-email delivery evidence. Reset validates the complete revocation acknowledgement; unknown outcomes cannot be replayed from that page. Password policy matches the existing server/APP and supports confirmation, without storing passwords or recovery tokens.

Public auth requests reject redirects, avoid caches, hold duplicate-dispatch gates and ignore replies after departure or link changes. Known error codes map to local copy instead of displaying arbitrary provider/credential text. Historical auth receipts and real browser password-entry/real email delivery remain outside this batch's proof. Nine existing HTTP suites now use owned IPv4 listeners after intermittent local transport failures, with original assertions/deadlines preserved and marketing request setup additionally verified. No production server or native APP behavior was changed by the listener fixes.

## 2026-10-02 Web analytics privacy follow-up

The previous global analytics bootstrap and route tracker could expose URL queries through default metadata. The web now loads the SDK inside an opaque, script-only sandbox with no referrer, receives coarse allowlisted events through a private channel, and supplies generic titles, empty referrers and sanitized locations. DNT/GPC skips initialization. Unused global payment SDK loading was removed while its component remains available. Auth query contracts and native APP code remain unchanged.

Regression tests exercise the real public bridge, malformed messages, privacy flags, provider failure and queue bounds. Synthetic browser QA verifies parent access raises `SecurityError` and verification tokens still reach only the original auth request. This is a local mitigation awaiting deployment, not evidence of historical disclosure or deletion, Google receipt, infrastructure-log sanitization, PWA-upgrade privacy or universal SDK compatibility.

## 1. High Risk - Production Database Data Loss
*   **Risk Level:** **HIGH (Disaster Class)**
*   **Threat Description:** The `package.json` start script contains `prisma db push --accept-data-loss`. In a production environment, if you modify the schema (even slightly) and restart the server, Prisma might decide to **wipe entire tables** to apply the changes without warning. This is a classic "Developer Convenience" setting that destroys production data.
*   **Affected Component:** `server/package.json` (Line 9)

    **(--- Hacker's Playbook / Disaster Scenario ---)**
    > **Scenario**: "I am not a hacker, I am you (the developer). I add a small field to the User model and push to Railway. Railway detects the code change and restarts the server. The start command runs. Prisma sees a schema drift. Because `--accept-data-loss` is on, it silently TRUNCATES the `Item` table to match the new schema. Boom. All user wishlists are gone. No hacker needed."

    **(--- Fix Principle ---)**
    > **Principle**: "The `Start` button should be for **Running** the engine, not **Rebuilding** the engine. Database migrations (`deploy`) are a separate, deliberate step that should happen *before* the app starts, and should NEVER accept data loss automatically. You want the deployment to FAIL if data loss is imminent, so you can save it."

    *   **Fix Suggestion:**
        1.  Remove `--accept-data-loss` from the `start` script.
        2.  Use `prisma migrate deploy` for production migrations (requires creating migration files locally with `prisma migrate dev`).
        3.  **Immediate action**: Change `start` to just `node dist/index.js` and run migrations manually or via a separate release command.

## 2. Medium Risk - Missing Rate Limiting (Brute Force Risk)
*   **Risk Level:** Medium
*   **Threat Description:** The API has no Rate Limiting middleware.
*   **Affected Component:** `server/src/index.ts`
*   **Hacker's Playbook:**
    > "I can write a script to try 10,000 passwords per second against your `/login` endpoint. Since there's no limit, I'll eventually guess a weak password (`password123`) inside minutes."
*   **Fix Suggestion:**
    *   Install `express-rate-limit`.
    *   Apply it globally or specifically to `/auth` routes.

## 3. Medium Risk - Missing Helmet (Security Headers)
*   **Risk Level:** Medium
*   **Threat Description:** Express default headers reveal `X-Powered-By: Express`, helping attackers identify the stack. Missing HSTS, XSS Protection headers.
*   **Fix Suggestion:**
    *   Install `helmet`.
    *   Use `app.use(helmet());` in `index.ts`.

## 4. Low Risk - Hardcoded "Backup" Keys (Potential)
*   **Risk Level:** Low
*   **Threat Description:** The chat history mentions keys being pasted. While currently not in code, ensure `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` are **ONLY** in Railway Variables and `.env`, never committed to Git.
*   **Fix Suggestion:**
    *   Verify `.gitignore` includes `.env`.

---
**Summary:**
The most critical issue is the `start` script command. Please fix it immediately to prevent accidental data deletion.
