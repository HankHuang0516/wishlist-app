# Mobile UX Audit - Round 52

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x800)
- **Features Tested**:
    1.  **Dashboard Sort** (Visibility)
    2.  **Add Item Flow** (Input Types)
    3.  **Item Detail** (Zoom Hint)
    4.  **General UX** (Language, Glitches)
- **Deployment**: Localhost

## 2. Findings (Bugs & UX Issues)

### 2.1 Critical: Raw i18n Keys Leaking
- **Issue**: Multiple UI elements show raw keys instead of text.
    - `dashboard.searchPlaceholder`
    - `dashboard.noDesc`
    - `common.saving`
    - `detail.price` (placeholder)
    - `detail.link` (placeholder)
    - `detail.notes` (placeholder)
- **Impact**: Makes the app look broken and untrustworthy.

### 2.2 Add Item Inputs
- **Price**: Has `inputmode="decimal"` (Good), but `type="text"` (Bad). Should be `type="number"`.
- **Link**: Has `type="text"`. Should be `type="url"`.
- **Image URL**: Not visible in the "Edit" modal.

### 2.3 Sort Dropdown Missing
- **Issue**: The "Sort" (or 排序) dropdown could not be found in the Dashboard header.
- **Cause**: Likely removed or hidden in a previous refactor.

### 2.4 Navigation & Stability
- **Glitches**:
    - Dashboard cards sometimes get stuck in "Processing..." skeleton state.
    - Closing "Item Detail" modal sometimes redirects to Home `/` instead of staying on Dashboard/Wishlist.

## 3. Repair Plan
1.  **i18n**: Check `client/src/utils/localization.ts` and `en.ts`/`zh.ts` to ensure all keys exist.
2.  **Inputs**: Update `AddItemModal.tsx` to use correct `type="..."` attributes.
3.  **Sort**: Re-enable or fix visibility of Sort dropdown in `WishlistDashboard.tsx`.
4.  **Stability**: Investigate modal close logic in `ItemDetailModal.tsx`.

## 4. Deployment Status
- [x] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production
