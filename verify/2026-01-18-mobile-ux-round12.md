# Mobile UX Audit - Round 12

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. Wishlist Share Flow
    2. Item Detail (Cloning)
    3. Profile Editing (Settings)
- **Deployment**: v0.0.113 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Wishlist Share (UX)
- **[UX] Missing Native Share**: The app relies on `navigator.clipboard.writeText`. On Mobile (iOS/Android), users expect the native "Share Sheet" (AirDrop, WhatsApp, etc.) to open when tapping "Share".
- **[Visual] Feedback**: The button text changing to "Copied!" is subtle.

### 2.2 Item Cloning (UX)
- **[UX] Intrusive Alerts**: When cloning an item, success/failure is shown via `alert("已成功加入您的清單！")`. This stops the world and looks unprofessional/non-native app-like.

### 2.3 Settings - Edit Profile (UX)
- **[UX] Silent Fail/Save**: Editing "Real Name" or "Address" triggers an auto-save on blur, but there is **no visual indicator** (spinner or "Saved!" text) like there is for Nicknames. Users are unsure if their data is safe.

## 3. Repair Plan
1.  **Share**: Implement `navigator.share()` API with fallback to clipboard.
2.  **Cloning**: Replace `alert()` with a simple inline success message or temporary button state change (e.g., "Cloned!").
3.  **Settings**: Generalize the "Saved!" indicator to apply to Real Name and Address fields as well.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.114)
