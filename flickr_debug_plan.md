# Flickr Upload Bug Analysis & Fix Plan

## 🐛 Problem Description
User reports that uploading local images results in the image being stored in `/public/uploads/` (local storage) instead of directly uploading to Flickr.

## 🔍 Root Cause Analysis

Based on the code in `server/src/controllers/itemController.ts` (specifically `createItem` function):

```typescript
// 1. Upload to Flickr immediately
const flickrUrl = await flickrService.uploadImage(...);

// Use Flickr URL or fallback to local if upload failed
const imageUrl = flickrUrl || `/uploads/${file.filename}`;
```

**The code explicitly falls back to local storage if `flickrService.uploadImage` returns `null`.**

Therefore, the issue is that **`uploadImage` is returning `null`**.

### Possible Reasons for `null` Return:

1.  **Missing Environment Variables (Most Likely)**:
    - `src/lib/flickr.ts` checks for `FLICKR_API_KEY`, `FLICKR_API_SECRET`, `FLICKR_OAUTH_TOKEN`, and `FLICKR_OAUTH_TOKEN_SECRET`.
    - If **ANY** of these are missing in the Railway Environment variables, the function explicitly returns `null` and logs: `[Flickr] Missing credentials, falling back to local/null.`

2.  **Invalid/Expired Credentials**:
    - If the OAuth token is invalid, the Flickr API call throws an error.
    - The `catch` block in `uploadImage` catches this error, logs `[Flickr] Upload failed: ...`, and returns `null`.

3.  **File Path Issues**:
    - If `fs.readFileSync(file.path)` fails (unlikely if multer works), it might throw.

## 🛠️ Debugging & Fix Plan

We will not modify code yet, but verify the configuration.

### Step 1: Check Railway Environment Variables (Crucial)
You must ensure the following variables are EXACTLY set in Railway Project Settings > Variables:

| Variable | Status |
|----------|--------|
| `FLICKR_API_KEY` | Must match your App Key |
| `FLICKR_API_SECRET` | Must match your App Secret |
| `FLICKR_OAUTH_TOKEN` | Output from `get_flickr_token.ts` |
| `FLICKR_OAUTH_TOKEN_SECRET` | Output from `get_flickr_token.ts` |
| `FLICKR_USER_ID` | Output from `get_flickr_token.ts` (Optional but good) |

**Action**: Go to Railway console, check these variables. If missing, add them and **Redeploy**.

### Step 2: Check Railway Logs
1. Open Railway Project.
2. Click on the `server` service.
3. Go to `Logs`.
4. Trigger an upload (or look at past logs).
5. Search for `[Flickr]`.

**Expected Log Messages**:
- **Failure Scenario 1**: `[Flickr] Missing credentials, falling back to local/null.` -> **Means Step 1 is the fix.**
- **Failure Scenario 2**: `[Flickr] Upload failed: ...` -> **Means Credential/API Error.** (Check error message details).
- **Success Scenario**: `[Flickr] Uploaded! Photo ID: ...` and `[Flickr] Got URL: ...`

### Step 3: Verify OAuth Permissions
- Ensure you authorized the app with **WRITE** permissions when you ran the script.
- If you suspect the token is bad, re-run `npx ts-node scripts/get_flickr_token.ts` locally and update the variables in Railway.

## 🚀 Future Code Improvements (If needed)
Once configuration is verified, if issues persist, we can:
1.  Add more verbose logging in `createItem` to show *exact* failure reason.
2.  Throw an error to the user instead of silent fallback (if strict Flickr usage is required).
