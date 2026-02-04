---
name: Railway Ops & Debugging
description: Helper for checking Railway status and debugging build errors
---

# Railway Operations & Build Debugging Skill

This skill provides tools for monitoring the Railway backend status and a comprehensive protocol for resolving build errors, based on project-specific lessons learned.

## 1. Railway Status Check

Use these commands to check the health and stats of the production server.

```bash
# Health Check
read_url_content https://wishlist-app-production.up.railway.app/api/admin/health

# System Stats (Users, Items, Lists)
read_url_content https://wishlist-app-production.up.railway.app/api/admin/stats?key=wishlist-secure-admin-2026-xK9p

# Crawler Logs
read_url_content https://wishlist-app-production.up.railway.app/api/admin/crawler-logs?key=wishlist-secure-admin-2026-xK9p

# Gemini API Status
read_url_content https://wishlist-app-production.up.railway.app/api/admin/gemini-status?key=wishlist-secure-admin-2026-xK9p
```

### Report Format
When reporting status, organize data into a markdown table:
```markdown
### 🏥 Health Check
- Status: ok
- Uptime: [seconds]
- Version: [version]

### 📊 System Stats
| Category | Count |
|----------|-------|
| Users    | ...   |
| Wishlists| ...   |
| Items    | ...   |

### 🕷️ Crawler Issues
(List recent errors or "None")

### ♊ Gemini Status
(Status and quota usage)
```

---

## 2. Build Debugging Protocol

Use this guide when `npm run build` fails. This specific protocol was derived from resolving critical build failures in Jan 2026.

### 🚨 Common Error Types & Fixes

#### A. "Unterminated string literal" or Corrupted Files
**Symptoms**: Random syntax errors in valid-looking code, especially in template literals or tailwind classes.
**Cause**: Invisible character corruption or encoding issues.
**Fix**:
1. Do NOT try to edit the specific line.
2. **Overwrite the entire file** using `write_to_file` with the known-correct content.
3. If uncertain, delete the file and recreate it.

#### B. "Cannot find name" (Missing Imports)
**Symptoms**: Hundreds of errors like `Cannot find name 'Dialog'`, `Cannot find name 'Loader2'`.
**Cause**: Missing imports, often when copying components or using auto-imports that didn't trigger.
**Fix**:
1. **Grep first**: `grep_search 'Loader2' src/` to see where it *should* come from.
2. **Check lucide-react**: Ensure the icon is actually exported by the specific version.
3. **Add imports manually**: Don't rely on "auto-fix". Open the file and add the import statement.

#### C. JSX Structure / "Expected corresponding JSX closing tag"
**Symptoms**: `Expected corresponding JSX closing tag` or weird indentation issues.
**Cause**: Extra `</div>`, unclosed custom components (`<Label>...</Label>` when it should be self-closing or vice versa), or mismatched nesting.
**Fix**:
1. **Fold methods**: Use `view_file` to read the component in chunks (start to 50, 50 to 100) to visually match indentation.
2. **Simplify**: Replace complex logic with a temporary placeholder to isolate the unclosed tag.
3. **Label Component**: Note that `Label` might be missing. Use HTML `<label className="...">` as a fallback.

#### D. Strict Type Checks (`noUnusedLocals`)
**Symptoms**: Build fails because a variable is declared but never read.
**Fix (Emergency)**:
1. Open `client/tsconfig.app.json`.
2. Set `"noUnusedLocals": false` and `"noUnusedParameters": false`.
3. Proceed with build. (Revert later if strictness is required).

### 🛠️ Verification Checklist
Before declaring "Fixed":
1. [ ] **Run Type Check**: `npm run build` (runs `tsc -b && vite build`).
2. [ ] **Run Tests**: `npm run test -- --run` to catch runtime crashes.
3. [ ] **Deployment**: Push to `main` and check Railway logs.

---


<!-- Section 3 Removed: Railway CLI is no longer used for deployment. -->


---

## 4. Automated Deployment Protocol

### 🚀 Deployment Flow
**Deployment is now fully automated via GitHub Actions.**

1.  **Commit & Push**:
    ```bash
    git add .
    git commit -m "feat: description of changes"
    git push origin main
    ```

2.  **GitHub Actions**:
    -   A workflow is triggered automatically on push.
    -   It runs tests and verification checks.
    -   **Only if all checks pass**, the deployment is triggered on Railway.

3.  **Monitor Deployment**:
    -   **GitHub**: Check the "Actions" tab in your repository to see if the workflow succeeded.
    -   **Railway**: If GitHub Actions pass, check the Railway dashboard for the deployment status.

### ⚠️ Manual Deployment (Emergency Only)
If the automated flow fails or you need to bypass checks (NOT RECOMMENDED):
1.  Go to Railway Dashboard.
2.  Click "Deploy" manually on the specific commit.


### Common Error Patterns
| Error | Meaning |
|-------|---------|
| `Exit code 1` | Generic crash - look 5-10 lines UP for root cause |
| `sh: <cmd>: not found` | Start command is wrong or tool not installed |
| `Nixpacks Error` | Missing `package.json` or entry point |
| `Connection refused` | App not listening on `$PORT` |
| `prisma generate` failed | DB schema out of sync |

---

## 5. 🚨 Critical Troubleshooting: Postgres Overwritten
**Incident Date**: 2026-01-20

### 💀 The Problem
The Postgres service crashes repeatedly with `P1001: Can't reach database server`.

### 🔍 Symptoms
1.  **Wrong Runtime**: The "Postgres" service environment shows `node@20.x` instead of Docker/Postgres.
2.  **App Logs in DB Service**: You see `npm start` or `prisma db push` logs appearing inside the *Postgres* service logs.
3.  **Deployment History**: Shows a `railway up` deployment (manual CLI) representing the mistake.

### ⚠️ Root Cause
Running `railway up` while linked to the **Postgres service** instead of the **App service**. 
*   **Note**: This can happen if the local environment was previously linked to Postgres for debugging, and then `railway up` is run (by user or Agent) without switching back.

### ✅ Solution (Browser Rollback)
1.  Go to **Railway Dashboard** -> **Postgres** Service.
2.  Click **Deployments** tab.
3.  Find the last stable deployment (Look for the Docker icon 🐳, usually image `ghcr.io/railwayapp-templates/postgres-ssl...`).
4.  Click **Three Dots (⋮)** -> **Redeploy**.

### 🛡️ Prevention
-   **CRITICAL**: Avoid running `railway up` manually. Rely on the automated pipeline.
-   If you MUST use CLI for some reason, verify `railway status` first.

---
**Last Updated**: 2026-01-20
**Context**: Emergency Build Fix for Wishlist App + Deployment Protocol + Postgres Recovery
