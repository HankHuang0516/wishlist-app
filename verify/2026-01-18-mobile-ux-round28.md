# Mobile UX Audit - Round 28

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Edit Wishlist** - Privacy Toggle (`WishlistDetail.tsx`)
    2. **Item Detail** - Image Interaction (`ItemDetailModal.tsx`)
    3. **Settings** - Premium Subscription UI (`SettingsPage.tsx`)
- **Deployment**: v0.0.129 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Edit Wishlist (Privacy Toggle)
- **[UX] Native Checkbox**: The privacy toggle is a standard browser checkbox. It feels inconsistent with the nice "Switches" we added in Notification Settings.
- **[Visual] Alignment**: The checkbox label text alignment isn't perfectly centered vertically with the box.

### 2.2 Item Detail (Image Interaction)
- **[UX] Static Image**: Tapping the product image does nothing. On mobile shopping apps, users expect to zoom or see a full-screen view to check details.
- **[Visual] Space**: The image container has a gray background even if the image has a white bg, which looks a bit unpolished.

### 2.3 Settings (Premium UI)
- **[UX] Clunky Cancellation**: Clicking "Cancel Subscription" triggers a native browser `alert()` and then a full page `reload()`. This breaks the app experience.
- **[Visual] Button Style**: The cancel button is a bit generic.

## 3. Repair Plan
1.  **Edit Wishlist**:
    -   Replace the native checkbox with the **Custom Switch** styling used in the Notification settings.
2.  **Item Detail**:
    -   Implement a **Lightbox** (full-screen modal) that opens when the image is tapped.
    -   Add a "Click to zoom" hint or icon.
3.  **Settings**:
    -   Replace `alert()` with the existing `ActionConfirmModal`.
    -   Remove `window.location.reload()` and use React state to update the UI (hide the premium badge) upon success.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.130)
