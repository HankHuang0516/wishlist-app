# Mobile UX Audit - Round 37

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Edit Item** (`ItemDetailModal.tsx`)
    2. **Avatar Upload** (`SettingsPage.tsx`)
    3. **Mobile Nav** (`BottomNav.tsx`)
- **Deployment**: v0.0.138 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Edit Item (`ItemDetailModal.tsx`)
- **[UX] Keyboard Overlay**: When editing description (textarea), the keyboard often covers the "Save" button if the content is long, because the modal body doesn't scroll independently of the footer.
- *Recommendation*: Ensure `CardContent` has `max-h-[...] overflow-y-auto` and the footer is sticky or fixed.

### 2.2 Avatar Upload (`SettingsPage.tsx`)
- **[UX] Feedback**: Uploading an image triggers a loading state, but on success/failure, it uses `alert()` or just stays silent.
- *Recommendation*: Use the Toast notification system for success/failure feedback instead of alerts.

### 2.3 Mobile Nav (`BottomNav.tsx`)
- **[UX] Touch Target**: Navigation items are wrapped in a generic `div`. The clickable area is the icon + text.
- *Observation*: The `NavLink` has padding, but checking `pb-safe` to ensure it clears the home indicator on iOS.
- *Finding*: `BottomNav.tsx` uses `pb-safe` which is good. However, the active state background pill is a bit tight.
- *Recommendation*: Increase the horizontal padding of the active pill slightly for a more "pill-like" look.

## 3. Repair Plan
1.  **ItemDetail**: Add `max-h-[60vh] overflow-y-auto` to the content area.
2.  **Settings**: Replace `alert` with custom toast/inline feedback (or re-use standard error UI).
3.  **Nav**: Widen the active indicator pill (`px-4`).

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.139)
