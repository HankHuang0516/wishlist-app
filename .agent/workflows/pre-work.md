---
description: 
---

---
description: Unified Pre-work Checklist & Railway Ops Protocol
---

# Pre-Work & Railway Status Checklist

Before starting ANY task, execute this checklist sequentially.

// turbo-all

**Important**: 全程用繁體中文溝通

## 0. 🔴 Auto Bug & Crawler Check (Priority)
**First**, check for production errors to prevent compounding issues.

```bash
# 1. Check Crawler Logs (Stop if count > 0)
read_url_content https://wishlist-app-production.up.railway.app/api/admin/crawler-logs?key=wishlist-secure-admin-2026-xK9p

# 2. Check System Health
read_url_content https://wishlist-app-production.up.railway.app/api/admin/health
```

- **If Crawler Logs > 0**: 🛑 **STOP!** Alert user and fix errors first.
- **If Health !ok**: investigate Railway logs using `railway logs`.

## 1. 🛡️ Read Rules & Stats
```bash
# View Project Rules
view_file .cursorrules

# View System Stats (Users, Items) - Optional but recommended for context
read_url_content https://wishlist-app-production.up.railway.app/api/admin/stats?key=wishlist-secure-admin-2026-xK9p
```

## 2. 🛠️ Development Protocol
- **Terminal**: NEVER chain commands with `;` or `&&` (except for the approved deploy command). Execute sequentially.
- **Hardcoded Values**: Do not hardcode production URLs. Use `server/src/config/constants.ts` or client helpers.
- **Paths**: Use `os.tmpdir()` instead of `/tmp`.

## 3. 🚀 Strict Deployment Protocol (CRITICAL)

### A. Pre-Deployment Checks
1. **Mandatory Validation**: Run `./scripts/validate-before-push.sh` (MUST PASS with all green).
2. **Run Tests**: `npm run test -- --run` (Already included in validation script).
3. **Bump Version**: Update `client/package.json` version.
4. **Update Changelog**: Add new entry to `client/src/data/changelog.ts`.
5. **Verify Target**: Run `railway status` to ensure you are linked to `Service: wishlist-app` (NOT Postgres).

### B. Deployment Command
**ALWAYS** use this exact format to enable debugging:

```bash
echo "=== Deploying v[VERSION] [REASON] ===" && git log -1 --oneline && railway up
```
*Example*: `echo "=== Deploying v1.0.6 Fix Avatar Upload ===" && git log -1 --oneline && railway up`

> [!NOTE] 關於自動連結原理
> Agent 能夠直接執行 `railway up` 且不需重新連結，是因為先執行了 `railway status`。
> 1. `railway status` 檢查當前環境的 Token 與專案連結狀態。
> 2. 如果狀態回傳正確 (Linked to: wishlist-app)，Agent 即可沿用既有的 credentials 進行部署。

PS C:\Hank\Other\project\wishlist-app> railway link
> Select a workspace hankhuang0516's Projects
> Select a project thorough-presence
> Select an environment production
> Select a service <esc to skip> wishlist-app

Project thorough-presence linked successfully! 🎉

## 4. ✅ Post-Deployment Verification

### A. Critical Endpoints
```bash
# 1. Version Check (Compare uptime < 120s)
read_url_content https://wishlist-app-production.up.railway.app/api/admin/health

# 2. AI Guide Check (Must return valid JSON with correct URLs)
read_url_content https://wishlist-app-production.up.railway.app/api/ai-guide
```
*If version stale: Ask user to Ctrl+Shift+R*

### B. Functional Verification (New)
```bash
# Verify API Key Lifecycle (Register -> Token -> API Key -> Get Profile)
npx tsx server/src/scripts/verify_prod_api_key.ts

### C. UX Verification (Recent Fixes)
1. **Avatar Upload Interaction**:
   - **Action**: Go to [Settings](https://wishlist-app-production.up.railway.app/settings) -> Click Avatar Image.
   - **Expectation**: File selector dialog MUST open.
   - **Reason**: Regression test for missing `onClick` handler.

### D. Feature Verification (8D Lesson)
Verify these E-commerce URLs on Production:
- Momo: `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558`
- PChome: `https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX`

### C. Common Fixes
| Symptom | Cause | Solution |
|---------|-------|----------|
| P1001 / Postgres Crash | Overwritten by App Code | Rollback Postgres service in Railway UI |
| 404 on API | Route ordering | Move API routes before SPA catch-all |
| Old Version | Browser Cache | Hard Refresh (Ctrl+Shift+R) |

---
For deep debugging, refer to: `.agent/skills/railway_ops/SKILL.md`