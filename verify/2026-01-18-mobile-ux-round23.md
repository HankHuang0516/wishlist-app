# Mobile UX Audit - Round 23

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Add Item Flow** (`AddItemModal.tsx`)
    2. **Purchase History** (`PurchaseHistoryPage.tsx`)
    3. **Change Password** (`ChangePasswordPage.tsx`)
- **Deployment**: v0.0.124 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Add Item Flow (`AddItemModal.tsx`)
- **[Localization] Hardcoded Text**: Labels "Name", "Price", "Currency", "Shopping Link", "Analyze Image", "Review Item" are hardcoded.
- **[UX] Wrong Keyboard**: Price input lacks `inputMode="decimal"`.
- **[UX] Missing Cancel**: The "Cancel" button in the footer might be too close to "Save", potentially causing accidental cancellations on small screens. (Actually layout seems standard, but labels are the main issue).

### 2.2 Purchase History (`PurchaseHistoryPage.tsx`)
- **[UX] Good Mobile Layout**: The dedicated mobile view with cards works well. No major issues found.

### 2.3 Change Password (`ChangePasswordPage.tsx`)
- **[UX] Password Managers**: Inputs lack `autoComplete` attributes (`current-password`, `new-password`), making it harder for mobile password managers to fill/update credentials.

## 3. Repair Plan
1.  **AddItemModal**:
    -   Replace hardcoded labels with `t('item.name')`, etc.
    -   Add `inputMode="decimal"` to Price Input.
2.  **ChangePasswordPage**:
    -   Add `autoComplete="current-password"` to current password field.
    -   Add `autoComplete="new-password"` to new/confirm fields.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.125)
