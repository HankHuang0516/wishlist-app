# Security Audit Report (Vibe Coding Shield)

**Project Info:** Wishlist App (Node.js/Express + React + Prisma)
**Auditor:** Code Guardian Aegis (AI Agent)
**Date:** 2026-01-01

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
