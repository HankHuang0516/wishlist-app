---
description: Pre-work checklist before starting any task in this project
---

# Pre-Work Checklist

Before starting ANY task in this project, you MUST:

// turbo-all

## 0. 🔴 Auto Bug Check (Priority)
**First**, check if there are any crawler errors in production:
```
read_url_content https://wishlist-app-production.up.railway.app/api/admin/crawler-logs?key=wishlist-secure-admin-2026-xK9p
```

- If `count > 0`: **STOP!** Alert the user about the errors and offer to investigate/fix before proceeding with their task.
- If `count = 0`: Continue with the normal checklist.

---

## 1. Read Project Rules
```
view_file .cursorrules
```

## 2. Documentation
Based on the task type, read the corresponding documentation as specified in `.cursorrules`.

## 3. For Deployments
- Run `npm run test -- --run` and verify all tests pass
- Update version in `client/package.json` using `git rev-list --count HEAD` + 1
- Avoid special characters in git commit messages

## 4. For Terminal Commands
- NEVER chain commands with `;` or `&&`
- Execute commands sequentially in separate steps

## 5. For E-commerce URL Features (8D Lesson)
- After deployment, verify on PRODUCTION with these test URLs:
  - Momo: `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558`
  - PChome: `https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX`
  - Shopee: Use any product URL with `/product/ID/ID` format
- If any fail, check if cloud IP is blocked and add Proactive Smart Search
- **Verify that all pages match the local language based on the device region**

## 6. 🔴 STRICT DEPLOYMENT CHECK (CRITICAL)
- **Before pushing code:**
    - Run `npm run test -- --run` locally.
    - **IF TESTS FAIL, DO NOT DEPLOY.** Fix the errors first.
    - Do not rely on "it worked before". Verify **every single time**.
- **After pushing:**
    - Monitor Railway build logs. If build fails, **ROLLBACK or FIX IMMEDIATELY**.

## 7. 🔴 POST-DEPLOYMENT VERIFICATION (CRITICAL)
After deployment, verify these critical endpoints:

### Version Check
```
read_url_content https://wishlist-app-production.up.railway.app/api/admin/health
```
- Compare `uptime` value (should be < 120s for fresh deploy)
- If version doesn't match expected, wait 2 minutes and recheck
- **Ask user to hard refresh browser (Ctrl+Shift+R) if they see old version**

### AI Guide Endpoint
```
read_url_content https://wishlist-app-production.up.railway.app/api/ai-guide
```
- Must return JSON with `meta.title` = "Wishlist.ai API Guide for AI Agents"
- If 404: Check if route defined BEFORE catch-all in `server/src/index.ts`
- **Root cause of 404 (2026-01-19)**: `sendFile()` path issues in Railway - use `res.json()` inline instead

### Common Issues
| Symptom | Cause | Solution |
|---------|-------|----------|
| Version not updating | Browser cache | Ctrl+Shift+R |
| 404 on /api/* routes | Catch-all before route | Move route before `app.get(/.*/, ...)` |
| sendFile 404 | Railway path resolution | Use inline `res.json()` instead |
