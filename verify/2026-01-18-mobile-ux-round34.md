# Mobile UX Audit - Round 34

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Edit Profile** (`SettingsPage.tsx`)
    2. **Wishlist Item: Mark Purchase** (`WishlistDetail.tsx`)
    3. **Create Wishlist** (`WishlistDashboard.tsx`)
- **Deployment**: v0.0.135 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Edit Profile (`SettingsPage.tsx`)
- **[UX] Edit Mode**: The profile section (viewed in lines 700+) allows changing the name, but the "Save Changes" button (lines 767) is far below at the bottom of the card. On mobile, if the keyboard is open, this button is hidden.
- **[Visual] Avatar**: The avatar upload has a nice overlay (Camera icon), but the file input is hidden. It relies on label triggering.

### 2.2 Wishlist Item: Mark Purchase (`WishlistDetail.tsx`)
- **[UX] Gift Icon**: The "Mark as Purchased" action uses a `Gift` icon button. It toggles status.
- **[Bug]**: If a user marks an item as "Purchased" (Gifted), there's no confirmaton toast. It just changes visual state (maybe opacity?). It feels abrupt.
- **[Touch Target]**: The button (line 450) is `size="icon"` which is usually 40x40. This is okay.

### 2.3 Create Wishlist (`WishlistDashboard.tsx`)
- **[Visual] Modal**: The "Create New" form is an inline expanded Card, not a modal. This pushes content down. On mobile, this is actually better than a modal that might be cut off.
- **[UX] Input Length**: The character counter `50` is small.

## 3. Repair Plan
1.  **WishlistDetail**:
    -   Add a toast notification when marking an item as Purchased/Unpurchased: "Marked as purchased" / "Marked as available".
    -   This provides crucial feedback.
2.  **Settings**:
    -   Make sure "Save Changes" is always visible or sticky... actually, for now, just ensure the form has enough padding bottom so it's not cut off.
    -   Wait, simple fix: Add `pb-8` to the container to ensure scroll space.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.136)
