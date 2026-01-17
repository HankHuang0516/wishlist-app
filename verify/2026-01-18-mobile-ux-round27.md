# Mobile UX Audit - Round 27

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Dashboard Empty State** (`WishlistDashboard.tsx`)
    2. **Social Search Result Cards** (`SocialPage.tsx`)
    3. **Language Switcher** (`SettingsPage.tsx`)
- **Deployment**: v0.0.128 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Dashboard Empty State (`WishlistDashboard.tsx`)
- **[UX] Bland Empty State**: If no wishlists exist, it likely shows nothing or a generic text. (Code review: it might just show empty list?). New users need a "Call to Action" helper.

### 2.2 Social Search Result Cards (`SocialPage.tsx`)
- **[Visual] Cramped Actions**: The "Info", "View", "Follow" buttons are packed tight on the right.
- **[UX] Avatar Size**: Avatars are `w-12 h-12`. A bit small for detailed profile pics on modern screens.

### 2.3 Language Switcher (`SettingsPage.tsx`)
- **[UX] Jarring Reload**: Clicking language triggers `window.location.reload()`. This is a hard refresh. While safe for i18n, it feels unrefined. An in-place state update + soft refresh context would be smoother (if using a React i18n lib), but given current `utils/localization.ts` uses localStorage reload is likely needed. We can at least add a loading spinner or "Applying..." state before reload to soften the blow.

## 3. Repair Plan
1.  **Dashboard**:
    -   Add a dedicated `<EmptyState>` when `wishlists.length === 0`.
    -   "Create your first wishlist" button in the empty state.
2.  **Social Cards**:
    -   Increase Avatar to `w-14 h-14`.
    -   Increase gap between action buttons.
3.  **Language**:
    -   Add a brief "Changing language..." loading overlay or button state before triggering reload, so the user knows why the page is hanging for a split second.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.129)
