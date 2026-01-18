# Test Plan: Release v0.0.153 (Comprehensive Verification)

## Scope
Verification of all mobile UX improvements, bug fixes, and core flows implemented between v0.0.107 and v0.0.153.

## 1. Mobile UX & Input Handling
- [ ] **Numeric Inputs**: 
    - Verify `ItemDetailModal` Price input uses `type="number"` / `inputMode="decimal"`.
    - Verify `AddItemModal` Price input uses `type="number"`.
- [ ] **URL Inputs**:
    - Verify `AddItemModal` Link input uses `type="url"`.
    - Verify `WishlistDetail` Quick Add URL uses `type="url"`.
- [ ] **Feedback System (Toast vs Alert)**:
    - Verify `WishlistDetail` operations (Add URL, Delete, Clone) use `setFeedbackMessage` (Toast) instead of `window.alert()`.

## 2. Localization (i18n) & Text
- [ ] **Share Button**: Verify toast displays localized "Link Copied!" / "連結已複製！" (Key: `detail.linkCopied`).
- [ ] **Settings Page**: Verify all labels (Login Name, Display Name) use `t(...)` keys.
- [ ] **Dashboard**: Verify Search placeholder and Empty state text are localized.

## 3. Core Functional Flows
- [ ] **Sorting**: 
    - Verify "Newest" vs "Oldest" sorts correctly (handling ID as number).
- [ ] **Guest Flow**: 
    - public wishlist -> "Join Now" banner -> Register Page -> Redirect back?
- [ ] **Item Management**:
    - Add Item (URL/Image)
    - Edit Item (Price/Link)
    - Delete Item (Check Toast feedback)

## 4. Code Quality & Stability
- [ ] **Console Errors**: Check for React unique key warnings or hydration errors.
- [ ] **Type Safety**: Verify `tsc` passes (via build command).

## 5. Deployment
- [ ] Verify `package.json` version is `0.0.153`.
- [ ] Confirm Railway deployment success.
