# Mobile UX Audit - Round 17

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Wishlist Edit (Settings)
    2. Settings Page (Language Switch)
    3. Add Item (URL Modal)
- **Deployment**: v0.0.118 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Settings Page (Visual)
- **[Visual] Weak Active State**: The Language buttons (English / 中文) use `variant="outline"` vs `default`, but the distinction might be subtle.
- **[Suggestion]**: Use a checkmark icon or a clearer background color distinction for the active language.

### 2.2 Wishlist Edit (Interaction)
- **[UX] Tiny Checkbox**: The "Public" setting uses a native `<input type="checkbox">` (16px). This is a difficult tap target on mobile compared to a modern toggle switch or a full-width clickable row.

### 2.3 Add Item Modal (Content)
- **[Content] Vague Label**: The input label says "Item Link" (or generic). Users might be confused if they can paste a title vs a URL. It also helps to be explicit: "Paste Product URL".

## 3. Repair Plan
1.  **Settings**: Add a `Check` icon to the active language button and ensure a disabled state for the active one to prevent re-reloading.
2.  **Wishlist Edit**: Wrap the checkbox and label in a `flex` container with `p-3` and a border/background to create a large "tap area".
3.  **Add Item**: Update the localization key `detail.itemLabel` (or hardcoded text) to "Paste Product URL (Magic Auto-Fill)".

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.119)
