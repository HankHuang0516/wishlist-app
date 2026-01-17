# Mobile UX Audit - Round 24

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Public Wishlist View** (Guest Mode)
    2. **Login Flow** (Feedback)
    3. **Bottom Navigation** (Visuals)
- **Deployment**: v0.0.125 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Public Wishlist View (`WishlistDetail.tsx`)
- **[Critical Bug] Guest Redirect**: When a guest (unauthenticated) visits a public wishlist link, if the fetch fails (or maybe even returns 200 public data but frontend logic is strict), the code `navigate('/dashboard')` forces them away. Guests cannot access the dashboard, so they get stuck or redirected to login.
- **[UX] Missing Context**: If it's a public view, the "Edit" buttons shouldn't even attempt to render or check `isOwner` logic potentially causing errros if `user` is null.

### 2.2 Login Flow (`Login.tsx`)
- **[UX] Static Error**: Login errors appear as small red text. On mobile, a "Shake" animation or a more distinct alert box (toast) is preferred for immediate feedback.
- **[UX] Password Toggle**: The eye icon tap target is strictly the icon size (small).

### 2.3 Bottom Navigation (`BottomNav.tsx`)
- **[UX] Active State Visibility**: The `fill-current/10` background on active icons is very subtle on some screens. Increasing contrast or line weight would help.

## 3. Repair Plan
1.  **WishlistDetail**:
    -   Remove auto-redirect to `/dashboard` on error. Show a "Not Found" or "Private List" empty state instead with a "Go Home" button.
    -   Ensure `token` is optional in the fetch header (handle `null`).
2.  **Login**:
    -   Add `animate-shake` (custom class or utility) on error.
    -   Increase hit area for password toggle.
3.  **BottomNav**:
    -   Increase active icon stroke width or change color intensity.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.126)
