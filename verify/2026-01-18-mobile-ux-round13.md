# Mobile UX Audit - Round 13

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Notification Settings Page
    2. Wishlist Dashboard (Create Flow)
    3. Delete Confirmation Modal
- **Deployment**: v0.0.114 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Notification Settings (Major Bug)
- **[Functional] Broken Controls**: The checkboxes for "Marketing emails" are present but **do nothing**. There is no state handler, no API call, and they are stuck at `defaultChecked`.
- **[UX] Missing Logic**: Users expect these to work.
- **[Visual] Hierarchy**: The `Back` button has text that is almost as large as the page title, creating competitive hierarchy on small screens.

### 2.2 Wishlist Dashboard (Mobile UX)
- **[UX] Screen Real Estate**: The "Create Wishlist" form is always expanded. On mobile, this pushes the existing wishlists 'below the fold', forcing users to scroll just to see their lists.
- **[Suggestion]**: Use a "Collapsable" section or a FAB (Floating Action Button) to toggle the form.

### 2.3 Delete Modal (Localization)
- **[I18N] Mixed Text**: The buttons say "取消 (Cancel)" and "確認刪除 (Confirm)". This is not proper localization; it's hardcoded bilingual text. It should use `t()` keys.

## 3. Repair Plan
1.  **Notifications**: Implement actual API integration (or at least functional UI state) for the toggles. *Note: If API endpoint doesn't exist, we will implement the UI state + LocalStorage or dummy API call to persist it purely on client for now as a "mock" feature until backend is ready.*
2.  **Dashboard**: Wrap the Create Form in a `<Collapsible>` or simple state toggle (`isCreatesOpen`). Default to `false` on mobile (or always false).
3.  **Delete Modal**: Replace hardcoded strings with `t('common.cancel')`, `t('common.confirm')`.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.115)
