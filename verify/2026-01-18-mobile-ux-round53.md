# Mobile UX Audit - Round 53 (Production)

## 1. Audit Scope
- **Environment**: Production (`https://wishlist-app-production.up.railway.app`)
- **Device**: Mobile Simulation (375x812)
- **Account**: `0933445566` / `password123`

## 2. Findings

### 2.1 Critical Bugs
- **Sort Feature Broken**: Dropdown exists (Deployment Successful), but selecting "Oldest" or "Name" does NOT reorder the list. The list is stuck on "Latest" (or default order).
- **Input Types Incorrect**: "Add Item" inputs (Price/Link) are still `type="text"`. The previous fix likely failed to apply or deploy.
    - Impact: No numeric keyboard on mobile.

### 2.2 Localization (i18n)
- **Raw Keys**:
    - `detail.linkCopied` (Share button feedback) - **NEW**
    - `dashboard.searchPlaceholder` - **PERSISTENT**
    - `dashboard.noDesc`
    - `dashboard.items`
- **Mixed Language**:
    - Settings page has mixed English labels ("Login Name", "Send Test Email") with Chinese text.
    - Buttons: "Close" (English) vs "編輯" (Chinese).

### 2.3 UI Glitches
- **Title Duplication**: Some wishlists show duplicated titles (e.g., "Mobile Sim 343Mobile Sim 343"). Likely data corruption or double-create issue.

## 3. Repair Plan
1.  **Inputs**: Force update `AddItemModal.tsx` to use `type="number"` (Price) and `type="url"` (Link).
2.  **Sort**: Sanitize Sort logic. Ensure `id` is treated as number: `Number(a.id) - Number(b.id)`.
3.  **i18n**: 
    - Add `detail.linkCopied`.
    - Audit `localization.ts` for missing keys.
    - Translate Settings page strings.

## 4. Deployment Check
- [x] Previous Deployment: **Partial Success** (WishlistDashboard updated, AddItemModal did not).
- [ ] Next Deployment: **Pending**
