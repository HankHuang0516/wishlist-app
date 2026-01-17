# Mobile UX Audit - Round 38

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Dashboard Pull-to-Refresh** (`WishlistDashboard.tsx`)
    2. **Wishlist Card Touch Area** (`WishlistDashboard.tsx`)
    3. **Language Switch Transition** (`SettingsPage.tsx`)
- **Deployment**: v0.0.139 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Dashboard Pull-to-Refresh (`WishlistDashboard.tsx`)
- **[UX] Missing Feature**: Users cannot pull down to refresh the list. If they perform an action on another device or want to check for updates, they have to reload the entire page.
- *Recommendation*: Add a manual "Refresh" button (or pull-to-refresh if using a library, but a button is safer/easier for PWA/Web). A small refresh icon near the title `My Dashboard` would work.

### 2.2 Wishlist Card Touch Area (`WishlistDashboard.tsx`)
- **[UX] Inconsistent Tapping**: The card title is a link, but the rest of the card might not be. If the user taps the white space of the card, nothing happens?
- *Code Check Needed*: I noticed in `WishlistDashboard` only the title usually has the `Link`. The entire card `onClick` should navigate.
- *Recommendation*: Wrap the entire `Card` content in `Link` or add `onClick` to the `Card` to navigate to detail.

### 2.3 Language Switch Transition (`SettingsPage.tsx`)
- **[UX] Jarring Reload**: Switching language triggers `window.location.reload()`. It flashes white.
- *Recommendation*: While a full reload is robust for i18n, we can mask it with a full-screen "Changing Language..." overlay that fades in before the reload, making it feel intentional.

## 3. Repair Plan
1.  **Dashboard**: Add a "Refresh" icon button next to "My Dashboard" title.
2.  **Dashboard**: Ensure the whole Wishlist Card is clickable (navigate to detail).
3.  **Settings**: Add a 'Changing Language' overlay state that shows a spinner and covers the screen before the reload happens.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.140)
