# Railway Deployment Checklist for Flickr Integration

## 📋 Pre-Deployment Checklist

### 1. Environment Variables (CRITICAL)

Go to Railway Dashboard → Your Project → Variables and verify:

| Variable | Value | Status |
|----------|-------|--------|
| `FLICKR_API_KEY` | `63e5e74b99b60fd251c0f4ffdbd669c5` | ⬜ Verified |
| `FLICKR_API_SECRET` | `c838d03f399b981a` | ⬜ Verified |
| `FLICKR_OAUTH_TOKEN` | `72157720962182558-a6674a4444cb4702` | ⬜ Verified |
| `FLICKR_OAUTH_TOKEN_SECRET` | `b21a63ca1b2e3075` | ⬜ Verified |
| `FLICKR_USER_ID` | `158881690@N04` | ⬜ Verified |

**⚠️ IMPORTANT**: Copy-paste these values EXACTLY. No extra spaces or quotes.

### 2. Code Changes

- ✅ `itemController.ts` updated to upload directly to Flickr
- ✅ `flickr.ts` library supports album management
- ✅ Enhanced logging for debugging
- ✅ Git commit created: `57afece feat: server - Implement Flickr image storage integration`
- ⬜ Pushed to Railway (run `git push origin main`)

### 3. Dependencies

Verify `package.json` includes:
- ✅ `flickr-sdk` (already installed)
- ✅ `dotenv` (already installed)

---

## 🚀 Deployment Steps

### Step 1: Push Code to Railway

```bash
cd "c:\Hank\Other\project\wishlist-app"
git push origin main
```
*This triggers the GitHub Actions workflow.*

### Step 2: Monitor GitHub Actions & Railway

1.  **Go to GitHub**: Check the "Actions" tab. Wait for all checks to pass.
2.  **Go to Railway**: Once GitHub Actions complete, the deployment starts automatically.
    -   Watch for "Building" -> "Deploying" -> "Success".
    -   Wait for "Success" status (usually 2-5 minutes).

### Step 3: Check Deployment Logs (If Needed)

1.  Click on your service in Railway
2.  Go to "Deployments" tab
3.  Click on the latest deployment
4.  Click "View Logs"

---

## 🔍 Post-Deployment Verification

### Test 1: Environment Variables

**In Railway Logs**, look for startup messages:

✅ **GOOD**: No error messages about missing credentials
❌ **BAD**: `[Flickr] Missing credentials, falling back to local/null.`

**If you see the BAD message**: Go back to Step 1 and double-check environment variables.

### Test 2: Upload Test

1. Open your deployed application
2. Create a new wishlist item
3. Upload an image
4. Watch Railway logs in real-time

**Expected Log Sequence**:
```
[CreateItem] Uploading image to Flickr...
[Flickr] Uploading item_...
[Flickr] Uploaded! Photo ID: ...
[Flickr] Found existing photoset: 72177720331445523
[Flickr] Added photo ... to photoset ...
[Flickr] Got URL: https://live.staticflickr.com/...
[CreateItem] ✅ Flickr upload successful: https://...
```

**Failure Scenarios**:

❌ **Scenario 1**: `[Flickr] Missing credentials`
   - **Fix**: Add missing environment variables in Railway

❌ **Scenario 2**: `[Flickr] Upload failed: ...`
   - **Fix**: Check the error message details
   - Common causes:
     - Invalid OAuth token (re-run `get_flickr_token.ts`)
     - Network issues (retry)
     - File format not supported (check image type)

❌ **Scenario 3**: `[CreateItem] ❌ FLICKR UPLOAD FAILED`
   - **Fix**: Check preceding Flickr logs for root cause

### Test 3: Verify in Flickr

1. Go to https://www.flickr.com/photos/158881690@N04/albums/72177720331445523
2. Verify the new image appears in the album
3. Click on the image to get its URL
4. Verify it matches the database `imageUrl`

### Test 4: Verify in Application

1. Reload the wishlist page
2. Verify the image displays correctly
3. Inspect the image URL (should start with `https://live.staticflickr.com/`)
4. Right-click → Copy image address to verify

---

## 🐛 Troubleshooting

### Problem: Image still goes to `/uploads/`

**Root Cause**: `flickrService.uploadImage()` is returning `null`

**Diagnosis Steps**:

1. **Check Environment Variables** (Most Common)
   ```bash
   # Run diagnostic script locally
   cd server
   npx ts-node scripts/diagnose_flickr_env.ts
   ```

2. **Check Railway Logs**
   - Look for `[Flickr] Missing credentials`
   - Look for `[Flickr] Upload failed: ...`

3. **Verify OAuth Token**
   - Token might be expired
   - Re-run authentication:
     ```bash
     cd server
     npx ts-node scripts/get_flickr_token.ts
     ```

### Problem: Deployment Fails

**Check Build Logs**:
1. Railway Dashboard → Deployments → Latest → View Logs
2. Look for TypeScript errors
3. Look for missing dependencies

**Common Issues**:
- Missing `flickr-sdk` in `package.json` (should be there)
- TypeScript compilation errors (run `npx tsc --noEmit` locally)

### Problem: "Permission Denied" Error

**Cause**: OAuth token doesn't have WRITE permission

**Fix**:
1. Re-run `get_flickr_token.ts`
2. When authorizing, ensure you select "Write" permission
3. Update `FLICKR_OAUTH_TOKEN` and `FLICKR_OAUTH_TOKEN_SECRET` in Railway

---

## ✅ Success Criteria

Your Flickr integration is working correctly when:

1. ✅ New uploads create items with Flickr URLs
2. ✅ Images display correctly in the application
3. ✅ Images appear in the Flickr album
4. ✅ Local `/uploads/` folder remains empty (images are deleted after upload)
5. ✅ Railway logs show successful Flickr uploads

---

## 📞 Support

If you continue to have issues:

1. **Check the logs**: Railway Logs are the source of truth
2. **Run diagnostics**: Use `diagnose_flickr_env.ts` script
3. **Verify configuration**: Double-check all environment variables
4. **Test locally**: Run the server locally with the same environment variables

**Key Log Patterns to Search For**:
- `[Flickr]` - All Flickr-related operations
- `[CreateItem]` - Image upload process
- `❌` or `ERROR` - Failure indicators
- `✅` - Success indicators
