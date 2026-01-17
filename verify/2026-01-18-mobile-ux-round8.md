# Mobile UX Audit - Round 8

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. Clone Item (Social -> View Item)
    2. Mobile Navigation (Layout)
    3. Auth Validation (Register)
- **Deployment**: v0.0.109 (Verified Code)

## 2. Findings (Bugs & UX Issues)

### 2.1 Missing Clone Feature (Major)
- **[Feature Gap]**: When viewing an item in someone else's wishlist (Social view), there is no option to "Add to My Wishlist".
- **[Localization]**: Keys like `detail.cloneTitle` exist, but the UI is missing.
- **[Impact]**: Users cannot curate items they discover.

### 2.2 Mobile Navigation
- **[UX] Unreachable**: Navigation icons are in the top header. On mobile, this requires reaching up.
- **[Standard]**: Mobile apps standardly use a Bottom Tab Bar.
- **[Suggestion]**: Implement a text-labeled Bottom Navigation Bar for mobile screens.

### 2.3 Registration UX
- **[UX] Password Visibility**: No "Show Password" eye icon in the registration form. Prone to typos on mobile.
- **[UX] Form Feedback**: Error messages appear at the top, potentially off-screen if user is scrolled down filling the form.

## 3. Repair Plan
1.  **Clone Item**: Implement "Add to Wishlist" in `ItemDetailModal`. Triggers a prompt to select target wishlist.
2.  **Bottom Nav**: specific `BottomNav` component for mobile (Home, Dashboard, Social, Settings).
3.  **Password Toggle**: Add `Eye/EyeOff` toggle to `Register.tsx` password input.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.110)
