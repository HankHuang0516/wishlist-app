# Flickr Image Display Bug & Fix Plan

## 🐛 Problem Description
- **Symptom**: Images uploaded to Flickr via the app are failing to load in the Web App (broken image icon), even though "Old" images work.
- **Specifics**:
    - Broken URL (from App): `..._f9520e5c93_o.jpg` (Original Size)
    - Working URL (from Flickr): `..._90f1a5a547_n.jpg` (Small Size)
    - CSP Config: `server/src/index.ts` allows `imgSrc: ["'self'", "data:", "https:", "http:", "*"]`. **CSP is NOT the issue.**

## 🔍 Root Cause Analysis
The issue lies in the **Size Selection Logic** in `server/src/lib/flickr.ts`.

The current code currently prioritizes:
1. `Original` (`_o.jpg`)
2. `Large`

### Why `_o.jpg` (Original) fails:
Flickr's "Original" size (`_o`) has stricter security/privacy rules than other resized versions (`_b`, `_n`, etc.).
- Even if `is_public: 1` is set, sometimes the **Original file** is restricted depending on account settings (e.g., "Who can download your photos?" setting in Flickr).
- If the viewer (the browser) is not logged into Flickr, accessing the `_o` URL might return **403 Forbidden**.
- Resized versions like `Large` (`_b`) or `Medium` (`_z`) are generated for public display and are generally accessible if the photo is public.

## 🛠️ Fix Plan

**Goal**: Change the logic to prioritize **Large** size (`_b`) instead of Original. Large is high quality enough for web display but safely public.

### Step 1: Modify `server/src/lib/flickr.ts`

**Current Logic**:
```typescript
const targetSize = sizes.find((s: any) => s.label === 'Original') || 
                   sizes.find((s: any) => s.label === 'Large') || ...
```

**New Logic**:
```typescript
// Prioritize 'Large' (1024px) or 'Large 1600' or 'Large 2048' over 'Original' to ensure public accessibility
const targetSize = sizes.find((s: any) => s.label === 'Large 2048') || 
                   sizes.find((s: any) => s.label === 'Large 1600') || 
                   sizes.find((s: any) => s.label === 'Large') || 
                   sizes.find((s: any) => s.label === 'Original') ...
```

### Step 2: Validation
- Re-upload an image.
- Check if the new URL ends in `_b.jpg`, `_k.jpg` (Large 2048), or `_h.jpg` (Large 1600) instead of `_o.jpg`.
- Verify it loads in an Incognito window.

### Note on Existing Broken Images
- This fix **only applies to new uploads**.
- For existing broken `_o.jpg` images in the database, you would need to manually update them or re-upload them. However, since this is a new feature, re-uploading via the app is the easiest path.
