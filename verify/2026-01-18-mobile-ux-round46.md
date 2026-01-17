# Mobile UX Audit - Round 46

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1.  **Change Password** (`ChangePasswordPage`)
    2.  **Purchase History** (`PurchaseHistoryPage`)
    3.  **Notification Settings** (`NotificationsSettingsPage`)
- **Deployment**: v0.0.147 (Broken) -> v0.0.148 (Fix + Improvements)

## 2. Findings (Bugs & UX Issues)

### 2.1 Change Password
- **[UX] Mobile Layout**: Form-based.
- *Issue*: Standard container. Might need `pb-20` like others for safe scrolling on mobile keyboard.
- *Check*: `ChangePasswordPage.tsx` likely missing padding.

### 2.2 Purchase History
- **[UX] Table/List**: Check `PurchaseHistoryPage`.
- *Issue*: Tables are notorious on mobile. It often overflows horizontally.
- *Recommendation*: Use a card-based layout for mobile inside `block md:hidden`, or ensure `overflow-x-auto`.

### 2.3 Notification Settings
- **[UX] Toggles**: `NotificationsSettingsPage`.
- *Issue*: Are toggles large enough? Are descriptions readable?
- *Check*: Usually standard shadcn switch. Ensure sufficient padding between rows.

## 3. Repair Plan
1.  **Sys**: Fix `WishlistDashboard` syntax (Done).
2.  **PurchaseHistory**: Add responsive table wrapper `overflow-x-auto`.
3.  **ChangePassword**: Add bottom padding.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.148)
