# Mobile UX Audit - Round 22

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Edit Item Flow** (Detail Modal)
    2. **Social Search** (Tabs, Input)
    3. **General Layout** (Missing Notifications)
- **Deployment**: v0.0.123 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Edit Item Flow (`ItemDetailModal.tsx`)
- **[UX] Wrong Keyboard**: The "Price" field brings up a standard text keyboard instead of a numeric/decimal pad.
- **[Localization] Hardcoded Text**: Labels "價格", "連結", "描述 / 備註" are hardcoded, breaking multi-language support.
- **[UX] No Save Feedback**: The "Save" button doesn't show a loading state or become disabled during the API call.

### 2.2 Social Search (`SocialPage.tsx`)
- **[UX] No Clear Button**: On mobile, deleting a long search query is tedious (requires repeatedly tapping backspace). A "Clear" (X) icon is standard.

### 2.3 General
- **[Feature] Missing Notifications**: User requested an audit of "Notification List", but no such feature exists in the UI (only Settings). I will verify if this was intended or a missing link. *Decided to scope this out for now as it requires backend implementation.*

## 3. Repair Plan
1.  **ItemDetailModal**:
    - Replace hardcoded labels with `t('detail.price')`, etc.
    - Add `inputMode="decimal"` to Price Input.
    - Add loading state (`disabled={saving}`) to Save button.
2.  **SocialPage**:
    - Add an "X" button inside the search input container to clear `searchQuery`.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.124)
