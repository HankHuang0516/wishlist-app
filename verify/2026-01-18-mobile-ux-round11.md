# Mobile UX Audit - Round 11

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Wishlist Detail (Visitor View/Empty State)
    2. Login Screen (Polish/Usability)
    3. Home Landing Page (Visual Consistency)
- **Deployment**: v0.0.112 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Wishlist Detail (Visitor Experience)
- **[UX/Bug] Silent Empty State**: If a user visits a public wishlist that has no items, they see a title and *nothing else*. No "This wishlist is empty" message. It looks broken.
- **[Visual] Item Cards**: The borders (status indicators) are nice, but checking them on mobile, the "Clone" (+) button is small. (Acceptable for now).

### 2.2 Login Screen (Usability)
- **[UX] No Password Toggle**: unlike the Register page, the Login page lacks the "Show Password" (Eye icon) toggle. On mobile, typing passwords blind is frustrating.
- **[Visual] Spacing**: "Forgot password" link is tucked away.

### 2.3 Home Page (Visual Consistency)
- **[Style] Font Mismatch**: The "Welcome Back" header uses `font-serif` (Times New Roman-ish), which clashes with the app's clean "Muji" (San-serif) aesthetic.
- **[Layout]**: Feature cards are large on mobile (`h-48` image + text), causing excessive scrolling.

## 3. Repair Plan
1.  **Wishlist Detail**: Add a friendly Empty State component.
    - Owner: "Tap + to add items!"
    - Visitor: "This wishlist is empty."
2.  **Login**: Port the Password Visibility Toggle (`showPassword` state) from Register page.
3.  **Home**: Remove `font-serif`.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.113)
