# Mobile UX Audit - Round 16

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Terms of Use (Content)
    2. Login Page (Interaction)
    3. Wishlist Detail (Header Layout)
- **Deployment**: v0.0.117 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Terms of Use (Legal/Trust)
- **[Legal] Dynamic Date**: Similar to the Privacy Policy issue, the "Last Updated" date shows the *current date* (`new Date()`) on every visit. This undermines trust and is legally inaccurate.

### 2.2 Login Page (Accessibility)
- **[UX] Small Touch Target**: The "Show Password" eye icon is standard size (16x16 or 24x24) inside the input. On mobile, continuously tapping this small area to toggle visibility can be frustrating.
- **[Suggestion]**: Increase the clickable area (padding) to meet the 44x44px minimum touch target guideline.

### 2.3 Wishlist Detail (Visual)
- **[Visual] Unbounded Description**: In the Wishlist Header, the description text renders fully. If a user writes a very long paragraph, it pushes the content (items) too far down.
- **[Suggestion]**: Apply `line-clamp-3` with a "Read more" toggle if possible, or just clamp it to keep the header compact on mobile.

## 3. Repair Plan
1.  **Terms of Use**: Hardcode the date to "2026-01-18".
2.  **Login**: Add `p-2` or `h-10 w-10` container to the Eye icon button to expand the hit area without changing the visual icon size.
3.  **Wishlist Detail**: Add `line-clamp-3` to the description `p` tag.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.118)
