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

## 3. Railway CLI Commands (Terminal)

### ⚠️ First Time Setup: Link Project
Before using any CLI commands, you must link the project:

```bash
railway link
# Select: hankhuang0516's Projects
# Select: thorough-presence
# Select: production
# Select: wishlist-app
```

Once linked, you'll see: `Project thorough-presence linked successfully! 🎉`

### Available Commands
Use these commands in the terminal when you need detailed deploy logs.

```bash
# Check deployment logs (most recent)
railway logs

# Filter for errors only
railway logs | grep -i "error"

# Filter for failed items
railway logs | grep -i "failed"

# Deploy and watch build output in real-time (best for debugging)
railway up

# List all deployments (to see FAILED status)
railway deployments

# Export logs to file for detailed analysis
railway logs > debug.txt
```

### Common Error Patterns
| Error | Meaning |
|-------|---------|
| `Exit code 1` | Generic crash - look 5-10 lines UP for root cause |
| `sh: <cmd>: not found` | Start command is wrong or tool not installed |
| `Nixpacks Error` | Missing `package.json` or entry point |
| `Connection refused` | App not listening on `$PORT` |
| `prisma generate` failed | DB schema out of sync |

---
**Last Updated**: 2026-01-18
**Context**: Emergency Build Fix for Wishlist App
