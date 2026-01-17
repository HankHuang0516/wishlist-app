# Mobile UX Audit - Round 26

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Edit Profile - Avatar** (`SettingsPage.tsx`)
    2. **Notification Settings** (`NotificationsSettingsPage.tsx`)
    3. **Wishlist Item List** (`WishlistDetail.tsx`)
- **Deployment**: v0.0.127 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Edit Profile - Avatar (`SettingsPage.tsx`)
- **[UX] Basic Input**: The avatar upload uses a raw `input type="file"`. On mobile, tapping a camera icon overlaying the avatar is standard and much more intuitive.
- **[UX] Hidden Input**: The file input might be visible or ugly depending on browser styling.

### 2.2 Notification Settings (`NotificationsSettingsPage.tsx`)
- **[UX] Toggle Feedback**: When toggling, the "Saved" text appears, but the toggle animation itself is instant/native. A smoother transition or custom switch CSS would feel more premium.
- **[UX] Layout**: The "Mandatory" text is small. It might be better as a badges.

### 2.3 Wishlist Item List (`WishlistDetail.tsx`)
- **[Visual] Cluttered Grid**: On small screens, the items are in a 1-column grid (good), but the card content is cramped. The "Info", "Hide", "Delete" buttons are stacked strictly vertically, taking up significant horizontal space in the right column.

## 3. Repair Plan
1.  **Settings**:
    -   Wrap the Avatar in a relative container.
    -   Add a "Camera" icon overlay with transparency.
    -   Make the `input type="file"` hidden but covering the full avatar area (clickable).
2.  **Notifications**:
    -   Replace native checkbox with a styled "Switch" component (using Tailwind classes like `peer` and `peer-checked`).
3.  **WishlistDetail**:
    -   Adjust item card layout: Make action buttons horizontal row at bottom or absolutely positioned for cleaner look? Or just tighter vertical spacing. Let's try 2x2 grid for actions or just simpler vertical stack with less padding.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.128)
